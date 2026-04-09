import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NORMALIZE_QUEUE } from './queue-names';

/**
 * Retry policy is configured here, on the producer side, so the entire
 * worker process inherits it from the job options. Three attempts is
 * enough for transient SLM/network blips; the exponential backoff
 * (5s → 25s → 125s) gives the SLM time to recover from a circuit-open
 * trip without holding the worker on a stuck job too long.
 *
 * Anything still failing after 3 attempts becomes a permanent FAILED
 * row. The reconciliation sweep handles workers that crash mid-job
 * and never get to mark either way.
 */
const RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 5000;

@Injectable()
export class NormalizeProducer {
  constructor(@InjectQueue(NORMALIZE_QUEUE) private readonly queue: Queue) {}

  /**
   * Enqueues a normalization job. The BullMQ job ID is forced to equal
   * the NormalizeJob primary key so there is one identity across both
   * systems — retries reuse the same ID.
   *
   * Idempotency note: BullMQ retries call the processor again with the
   * same payload. The processor must therefore be safe to run twice on
   * the same jobId. Week 2 enforces this via:
   *  - markActive accepts {QUEUED, ACTIVE} (idempotent)
   *  - RoutingService upserts OCSFEvent and ProcessingMetric
   *  - ReviewService upserts ManualReview
   *  - SQSClientService passes a dedup id (FIFO queues only)
   */
  async enqueue(jobId: string): Promise<void> {
    await this.queue.add(
      NORMALIZE_QUEUE,
      { jobId },
      {
        jobId,
        attempts: RETRY_ATTEMPTS,
        backoff: { type: 'exponential', delay: RETRY_BACKOFF_MS },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
  }
}
