import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NORMALIZE_QUEUE } from './queue-names';

@Injectable()
export class NormalizeProducer {
  constructor(
    @InjectQueue(NORMALIZE_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Enqueues a normalization job. The BullMQ job ID is forced to equal the
   * NormalizeJob primary key so there is one identity across both systems.
   *
   * No retries: attempts=1. Idempotency and retry policy are Week 2.
   */
  async enqueue(jobId: string): Promise<void> {
    await this.queue.add(
      NORMALIZE_QUEUE,
      { jobId },
      { jobId, attempts: 1, removeOnComplete: false, removeOnFail: false },
    );
  }
}
