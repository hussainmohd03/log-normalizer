import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NORMALIZE_QUEUE } from './queue-names';

const RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 5000;

@Injectable()
export class NormalizeProducer {
  constructor(@InjectQueue(NORMALIZE_QUEUE) private readonly queue: Queue) {}


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
