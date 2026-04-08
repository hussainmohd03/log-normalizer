import { Injectable, Logger } from '@nestjs/common';
import { NormalizeJob } from 'generated/prisma/client';
import { JobsService } from 'src/jobs/jobs.service';
import { NormalizeProducer } from 'src/queue/normalize.producer';
import { NormalizeRequestDto } from './dto/normalize-request.dto';

@Injectable()
export class NormalizeService {
  private readonly logger = new Logger(NormalizeService.name);

  constructor(
    private readonly jobsService: JobsService,
    private readonly normalizeProducer: NormalizeProducer,
  ) {}

  async create(dto: NormalizeRequestDto): Promise<NormalizeJob> {
    const row = await this.jobsService.create(dto);

    try {
      await this.normalizeProducer.enqueue(row.id);
      this.logger.log(
        { jobId: row.id, source: row.source },
        'normalize.enqueued',
      );
    } catch (err) {
      this.logger.error(
        { jobId: row.id, err: (err as Error).message },
        'normalize.enqueue_failed',
      );
      // Best-effort cleanup: if enqueue fails the BullMQ job was never created,
      // so the row would be a silent orphan. Wrap deleteQuietly in its own
      // try/catch — even if it violates its "never throws" contract, the
      // original enqueue error must be what the caller sees.
      try {
        await this.jobsService.deleteQuietly(row.id);
      } catch {
        // swallow — cleanup failure must not mask the real error
      }
      throw err;
    }

    return row;
  }
}
