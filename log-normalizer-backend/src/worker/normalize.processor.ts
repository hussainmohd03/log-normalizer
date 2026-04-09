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

    let row;
    try {
      row = await this.jobsService.markActive(jobId);
    } catch (err) {
      // Row missing or in terminal state - sweep race or manual delete.
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


    if (NormalizeProcessor.isSlmFailure(response)) {
      const message = response.error ?? 'SLM returned no OCSF payload';
      await this.handleFailure(jobId, message, attemptNum, maxAttempts, isFinalAttempt, startedAt, 'SLM returned failure');
      throw new Error(message);
    }

    try {
      await this.routingService.route(row, response);
    } catch (err) {
      const message = (err as Error).message ?? 'routing failed';
      await this.handleFailure(jobId, message, attemptNum, maxAttempts, isFinalAttempt, startedAt, 'routing threw');
      throw err;
    }

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
      fixesApplied: response.fixes_applied ?? [],
      hallucinationsStripped: response.hallucinations_stripped ?? [],
    };
  }
}
