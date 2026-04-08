import { Injectable, Logger } from "@nestjs/common";
import { JobsService } from "src/jobs/jobs.service";
import { NormalizeProducer } from "src/queue/normalize.producer";
import { IngestBatchDto, IngestDto } from "./dto/ingest-log.dto";

/**
 * Sole submit path for the normalize pipeline.
 *
 *   POST /api/logs/ingest          → receiveAlert  → 1 NormalizeJob, 1 enqueue
 *   POST /api/logs/ingest/batch    → receiveBatch  → N NormalizeJobs, N enqueues
 *
 * The old fire-and-forget background promise is gone — every alert now
 * flows through the BullMQ worker, which is the single chokepoint for
 * SLM calls (concurrency=1, one GPU). Status is tracked on the
 * NormalizeJob row and exposed via GET /normalize/jobs/:id and the
 * SSE endpoint at /normalize/jobs/:id/events.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly jobsService: JobsService,
    private readonly normalizeProducer: NormalizeProducer,
  ) {}

  async receiveAlert(dto: IngestDto): Promise<{ jobId: string; status: 'queued' }> {
    const jobId = await this.createAndEnqueue({
      rawLog: dto.rawContent,
      source: dto.source,
      format: dto.format ?? 'json',
    });
    return { jobId, status: 'queued' };
  }

  async receiveBatch(dto: IngestBatchDto): Promise<{ jobIds: string[]; status: 'queued'; count: number }> {
    const format = dto.format ?? 'json';
    const jobIds: string[] = [];

    // Sequential to keep the cleanup-on-failure semantics simple. The
    // queue can absorb the bursts; the bottleneck is the worker anyway.
    for (const alert of dto.alerts) {
      const jobId = await this.createAndEnqueue({
        rawLog: alert,
        source: dto.source,
        format,
      });
      jobIds.push(jobId);
    }

    return { jobIds, status: 'queued', count: jobIds.length };
  }

  /**
   * Insert + enqueue with the same best-effort cleanup pattern as the
   * removed NormalizeService: if enqueue fails, delete the orphan row
   * so it doesn't sit forever as a silent QUEUED.
   */
  private async createAndEnqueue(input: {
    rawLog: Record<string, any>;
    source: string;
    format: string;
  }): Promise<string> {
    const row = await this.jobsService.create(input);

    try {
      await this.normalizeProducer.enqueue(row.id);
      this.logger.log(
        { jobId: row.id, source: row.source },
        'ingest.enqueued',
      );
      return row.id;
    } catch (err) {
      this.logger.error(
        { jobId: row.id, err: (err as Error).message },
        'ingest.enqueue_failed',
      );
      try {
        await this.jobsService.deleteQuietly(row.id);
      } catch {
        // swallow — cleanup failure must not mask the real error
      }
      throw err;
    }
  }
}
