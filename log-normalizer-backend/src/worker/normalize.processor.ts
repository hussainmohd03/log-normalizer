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
 * Contract: this method must always return normally for non-actionable
 * deliveries (row missing, row already moved out of QUEUED). Throwing
 * would push the BullMQ job into the failed-set without a corresponding
 * DB transition, splitting truth between Postgres and Redis. The DB row
 * is the source of truth — BullMQ is just the delivery mechanism.
 *
 * Real failures (SLM crash, DB write failure) are caught, logged, and
 * the row is moved to FAILED. The method still returns normally so
 * BullMQ marks the delivery as completed.
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

    // Step 1 — claim the row. Doing this BEFORE any other work minimises
    // the QueueEvents-vs-DB-write race window the SSE listener cares about.
    let row;
    try {
      row = await this.jobsService.markActive(jobId);
    } catch (err) {
      // Either the row was deleted manually or it is no longer in QUEUED.
      // Both cases: log + ack. Do not crash the worker, do not retry.
      this.logger.warn(
        { jobId, reason: (err as Error).message },
        'normalize.skip: unable to claim job',
      );
      return;
    }

    this.logger.log({ jobId, source: row.source }, 'normalize.start');
    const startedAt = Date.now();

    // Step 2 — call the SLM. SLMService wraps a circuit breaker; the
    // breaker may throw on open, on timeout, or on a network error.
    let response: SLMResponse;
    try {
      response = await this.slmService.normalize({
        raw_log: row.rawLog,
        source: row.source,
        format: row.format,
      });
    } catch (err) {
      const message = (err as Error).message ?? 'unknown SLM error';
      this.logger.error(
        { jobId, err: message, durationMs: Date.now() - startedAt },
        'normalize.fail: SLM call threw',
      );
      await this.failQuietly(jobId, message);
      return;
    }

    // Step 3 — interpret the response. The Python service can return 200
    // with `error` populated and `ocsf: null` when validation rejects
    // everything. That is a failure for our purposes.
    if (NormalizeProcessor.isSlmFailure(response)) {
      const message = response.error ?? 'SLM returned no OCSF payload';
      this.logger.warn(
        { jobId, err: message, durationMs: Date.now() - startedAt },
        'normalize.fail: SLM returned failure',
      );
      await this.failQuietly(jobId, message);
      return;
    }

    // Step 4 — write downstream artifacts BEFORE marking the row
    // COMPLETED. If routing fails (OCSFEvent insert, ManualReview write,
    // SQS publish), we want the row to end FAILED with that error rather
    // than COMPLETED with missing children. The contract becomes:
    // status=COMPLETED ⟹ OCSFEvent + ProcessingMetric exist for this job.
    try {
      await this.routingService.route(row, response);
    } catch (err) {
      const message = (err as Error).message ?? 'routing failed';
      this.logger.error(
        { jobId, err: message, durationMs: Date.now() - startedAt },
        'normalize.fail: routing threw',
      );
      await this.failQuietly(jobId, message);
      return;
    }

    // Step 5 — write the success row.
    try {
      await this.jobsService.markCompleted(
        jobId,
        NormalizeProcessor.toCompleteDto(response),
      );
      this.logger.log(
        {
          jobId,
          decision: response.decision,
          confidence: response.confidence,
          durationMs: Date.now() - startedAt,
        },
        'normalize.done',
      );
    } catch (err) {
      // markCompleted only throws if the row is not in ACTIVE — meaning
      // someone else moved it. Log and ack; we cannot do anything sane.
      this.logger.error(
        { jobId, err: (err as Error).message },
        'normalize.fail: markCompleted rejected',
      );
    }
  }

  private async failQuietly(jobId: string, error: string): Promise<void> {
    try {
      await this.jobsService.markFailed(jobId, error);
    } catch (err) {
      this.logger.error(
        { jobId, err: (err as Error).message },
        'normalize.fail: markFailed rejected',
      );
    }
  }

  static isSlmFailure(response: SLMResponse): boolean {
    return response.error !== null || response.ocsf === null;
  }

  static toCompleteDto(response: SLMResponse): CompleteNormalizeJobDto {
    // Caller has already verified ocsf is non-null via isSlmFailure.
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
