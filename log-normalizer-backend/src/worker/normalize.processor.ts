import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SLMResponse } from 'src/common/interfaces/slm-response.interface';
import { CompleteNormalizeJobDto } from 'src/jobs/dto/complete-normalize-job.dto';
import { JobsService } from 'src/jobs/jobs.service';
import { NORMALIZE_QUEUE } from 'src/queue/queue-names';
import { RoutingService } from 'src/routing/routing.service';
import { SLMService } from 'src/slm/slm.service';

interface NormalizeJobPayload {
  jobId: string;
}

/**
 * BullMQ consumer for the normalize queue.
 *
 * Concurrency is pinned to 1 — we have one GPU and the SLM batches at 1.
 *
 * Retry contract (Week 2)
 * ───────────────────────
 * Retries are configured on the producer side (attempts: 3, exponential
 * backoff). For BullMQ to actually retry, this method must THROW on
 * transient failures — returning normally tells BullMQ the job
 * succeeded.
 *
 *  - Transient failure (more attempts remaining):
 *      throw the error → BullMQ schedules retry → DB row stays ACTIVE
 *  - Final failure (last attempt exhausted):
 *      markFailed with attempt count → throw → BullMQ marks failed too
 *  - Success:
 *      routing → markCompleted → return normally
 *
 * Idempotency on retry
 * ────────────────────
 * The processor must be safe to run twice on the same jobId. Week 2
 * guarantees that via:
 *  - markActive accepts {QUEUED, ACTIVE} and increments attempts column
 *  - RoutingService upserts OCSFEvent and ProcessingMetric
 *  - ReviewService upserts ManualReview
 *  - SQSClientService dedupes by jobId on FIFO queues
 *
 * BullMQ note on worker restarts: if the worker process dies between
 * attempts, BullMQ resumes from the last persisted state — it does NOT
 * restart from attempt 1. The reconciliation sweep handles workers that
 * die WHILE processing (the row is left ACTIVE forever otherwise).
 *
 * Non-actionable deliveries
 * ─────────────────────────
 * If markActive fails (row missing or in terminal state from a sweep
 * race), we ack the BullMQ delivery and return normally — there is
 * nothing to do, retrying won't help.
 */
@Processor(NORMALIZE_QUEUE, { concurrency: 1 })
export class NormalizeProcessor extends WorkerHost {
  private readonly logger = new Logger(NormalizeProcessor.name);

  constructor(
    private readonly jobsService: JobsService,
    private readonly slmService: SLMService,
    private readonly routingService: RoutingService,
  ) {
    super();
  }

  async process(job: Job<NormalizeJobPayload>): Promise<void> {
    const jobId = job.data.jobId;
    const attemptNum = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = attemptNum >= maxAttempts;
    const startedAt = Date.now();

    // Step 1 — claim the row. Idempotent across retries.
    let row;
    try {
      row = await this.jobsService.markActive(jobId);
    } catch (err) {
      // Row missing or in terminal state — sweep race or manual delete.
      // Ack the BullMQ delivery and move on; retrying will not help.
      this.logger.warn(
        { jobId, attempt: attemptNum, reason: (err as Error).message },
        'normalize.skip: unable to claim job',
      );
      return;
    }

    this.logger.log(
      { jobId, attempt: attemptNum, maxAttempts, source: row.source },
      'normalize.start',
    );

    // Step 2 — call the SLM.
    let response: SLMResponse;
    try {
      response = await this.slmService.normalize({
        raw_log: row.rawLog,
        source: row.source,
        format: row.format,
      });
    } catch (err) {
      const message = (err as Error).message ?? 'unknown SLM error';
      await this.handleFailure(jobId, message, attemptNum, maxAttempts, isFinalAttempt, startedAt, 'SLM call threw');
      throw err;
    }

    // Step 3 — interpret the response. The Python service can return 200
    // with `error` populated and `ocsf: null` when validation rejects
    // everything. We treat that as a transient/permanent failure too.
    if (NormalizeProcessor.isSlmFailure(response)) {
      const message = response.error ?? 'SLM returned no OCSF payload';
      await this.handleFailure(jobId, message, attemptNum, maxAttempts, isFinalAttempt, startedAt, 'SLM returned failure');
      throw new Error(message);
    }

    // Step 4 — write downstream artifacts BEFORE marking the row
    // COMPLETED. The hard contract: status === COMPLETED ⟹ OCSFEvent +
    // ProcessingMetric exist for this job. Routing UPSERTs are safe to
    // replay across retries.
    try {
      await this.routingService.route(row, response);
    } catch (err) {
      const message = (err as Error).message ?? 'routing failed';
      await this.handleFailure(jobId, message, attemptNum, maxAttempts, isFinalAttempt, startedAt, 'routing threw');
      throw err;
    }

    // Step 5 — mark the row COMPLETED. Last write before returning
    // normally so BullMQ marks the BullMQ job completed too.
    try {
      await this.jobsService.markCompleted(
        jobId,
        NormalizeProcessor.toCompleteDto(response),
      );
      this.logger.log(
        {
          jobId,
          attempt: attemptNum,
          decision: response.decision,
          confidence: response.confidence,
          durationMs: Date.now() - startedAt,
        },
        'normalize.done',
      );
    } catch (err) {
      // markCompleted only rejects if the row is no longer ACTIVE — a
      // sweep raced us. Log and ack; we cannot do anything sane.
      this.logger.error(
        { jobId, err: (err as Error).message },
        'normalize.fail: markCompleted rejected',
      );
    }
  }

  /**
   * Logs the failure and, on the FINAL attempt only, transitions the
   * row to FAILED with an error message that includes the attempt
   * count. On non-final attempts the row stays ACTIVE so the next
   * BullMQ retry can pick it up.
   */
  private async handleFailure(
    jobId: string,
    error: string,
    attempt: number,
    maxAttempts: number,
    isFinal: boolean,
    startedAt: number,
    reason: string,
  ): Promise<void> {
    const durationMs = Date.now() - startedAt;

    if (isFinal) {
      const finalError = `${error} (attempt ${attempt}/${maxAttempts})`;
      this.logger.error(
        { jobId, attempt, maxAttempts, err: error, durationMs },
        `normalize.fail.final: ${reason}`,
      );
      try {
        await this.jobsService.markFailed(jobId, finalError);
      } catch (markErr) {
        // markFailed only rejects if the row was already moved out of
        // ACTIVE — a sweep raced us. Log and let the throw at the call
        // site continue so BullMQ records the failed state.
        this.logger.error(
          { jobId, err: (markErr as Error).message },
          'normalize.fail: markFailed rejected',
        );
      }
    } else {
      this.logger.warn(
        { jobId, attempt, maxAttempts, err: error, durationMs },
        `normalize.fail.transient: ${reason}`,
      );
    }
  }

  static isSlmFailure(response: SLMResponse): boolean {
    return response.error !== null || response.ocsf === null;
  }

  static toCompleteDto(response: SLMResponse): CompleteNormalizeJobDto {
    return {
      ocsf: response.ocsf!,
      confidence: response.confidence,
      decision: response.decision,
      breakdown: response.breakdown ?? {},
      validationErrors: response.validation_errors ?? [],
      processingTimeMs: response.processing_time_ms,
    };
  }
}
