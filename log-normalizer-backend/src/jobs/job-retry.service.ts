import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, NormalizeJob } from 'generated/prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { NormalizeProducer } from 'src/queue/normalize.producer';

/**
 * Job retry orchestration. Replaces the deleted ReprocessJob.
 *
 * Contract
 * ────────
 * Retry is only valid against a FAILED source job. Any other state is a
 * 409 Conflict — running, queued, or completed jobs should not be
 * "retried" (the queued/running ones haven't finished yet, the completed
 * ones don't need it; submit a new alert instead).
 *
 * Each retry creates a NEW NormalizeJob row with a NEW UUID. BullMQ
 * rejects duplicate job IDs by design, and the new row gives a clean
 * audit trail per attempt. The new row's parentJobId points back to the
 * source job so the chain is traversable.
 *
 * Idempotency keys are NOT copied. The original key (if any) was
 * consumed by the original create — if the client wants idempotent
 * retries they pass a new key on the retry endpoint (Week 3 may add
 * that; for Week 2 retry is human-triggered and idempotency is moot).
 */
@Injectable()
export class JobRetryService {
  private readonly logger = new Logger(JobRetryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizeProducer: NormalizeProducer,
  ) {}

  async retry(sourceId: string): Promise<NormalizeJob> {
    const source = await this.prisma.normalizeJob.findUnique({
      where: { id: sourceId },
    });

    if (!source) {
      throw new NotFoundException(`Job ${sourceId} not found`);
    }

    JobRetryService.assertRetryable(source);

    // Insert the new row first; if enqueue fails, delete it (same
    // pattern as IngestionService.createAndEnqueue).
    const child = await this.prisma.normalizeJob.create({
      data: {
        rawLog: source.rawLog as object,
        source: source.source,
        format: source.format,
        parentJobId: source.id,
      },
    });

    try {
      await this.normalizeProducer.enqueue(child.id);
      this.logger.log(
        { jobId: child.id, parentJobId: source.id, source: source.source },
        'job_retry.enqueued',
      );
      return child;
    } catch (err) {
      this.logger.error(
        { jobId: child.id, parentJobId: source.id, err: (err as Error).message },
        'job_retry.enqueue_failed',
      );
      try {
        await this.prisma.normalizeJob.delete({ where: { id: child.id } });
      } catch {
        // swallow — cleanup failure must not mask the real error
      }
      throw err;
    }
  }

  /**
   * 409s on any non-FAILED state with an explicit message per state.
   * Pulled out as a static so the controller spec can drive it without
   * spinning up Prisma.
   */
  static assertRetryable(source: NormalizeJob): void {
    switch (source.status) {
      case JobStatus.FAILED:
        return;
      case JobStatus.QUEUED:
        throw new ConflictException('job is still queued');
      case JobStatus.ACTIVE:
        throw new ConflictException('job is still running');
      case JobStatus.COMPLETED:
        throw new ConflictException(
          'job already completed; submit a new alert instead',
        );
    }
  }
}
