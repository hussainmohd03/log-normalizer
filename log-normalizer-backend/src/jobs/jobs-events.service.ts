import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueEvents } from 'bullmq';
import { Observable, Subject } from 'rxjs';
import { NORMALIZE_QUEUE } from 'src/queue/queue-names';
import { JobEvent, createJobStream } from './jobs-stream';
import { JobsService } from './jobs.service';

/**
 * Owns the singleton BullMQ QueueEvents subscription for the normalize
 * queue. One Redis connection is multiplexed to N SSE clients via an
 * RxJS Subject — clients filter by jobId.
 *
 * The actual stream-shaping logic lives in jobs-stream.ts so it can be
 * unit-tested without booting BullMQ. This service is the thin
 * lifecycle wrapper: bring the QueueEvents up on module init, tear it
 * down on destroy, pump events into the subject in between.
 */
@Injectable()
export class JobsEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsEventsService.name);
  private readonly events$ = new Subject<JobEvent>();
  private queueEvents?: QueueEvents;

  constructor(
    private readonly config: ConfigService,
    private readonly jobsService: JobsService,
  ) {}

  onModuleInit(): void {
    this.queueEvents = new QueueEvents(NORMALIZE_QUEUE, {
      connection: { url: this.config.getOrThrow<string>('REDIS_URL') },
    });

    // BullMQ delivers `jobId` as a string in every event payload. We
    // forward it as-is — downstream consumers do their own DB read.
    this.queueEvents.on('active', ({ jobId }) => {
      this.events$.next({ jobId, kind: 'active' });
    });
    this.queueEvents.on('completed', ({ jobId }) => {
      this.events$.next({ jobId, kind: 'completed' });
    });
    this.queueEvents.on('failed', ({ jobId }) => {
      this.events$.next({ jobId, kind: 'failed' });
    });

    this.queueEvents.on('error', (err) => {
      this.logger.error(
        { err: err.message },
        'jobs_events.queue_events_error',
      );
    });

    this.logger.log('jobs_events.ready');
  }

  async onModuleDestroy(): Promise<void> {
    this.events$.complete();
    if (this.queueEvents) {
      await this.queueEvents.close();
      this.logger.log('jobs_events.closed');
    }
  }

  /**
   * Returns an SSE-ready observable for one job. Emits the current DB
   * row immediately, then pushes a re-read after every relevant
   * QueueEvents transition, then completes once the row reaches a
   * terminal state.
   */
  streamJob(jobId: string): Observable<MessageEvent> {
    return createJobStream(jobId, this.events$.asObservable(), (id) =>
      this.jobsService.findById(id),
    );
  }
}
