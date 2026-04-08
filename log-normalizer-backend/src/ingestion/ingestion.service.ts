import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "generated/prisma/client";
import { JobsService } from "src/jobs/jobs.service";
import { NormalizeProducer } from "src/queue/normalize.producer";
import { IngestBatchDto, IngestDto } from "./dto/ingest-log.dto";

interface IngestResult {
  jobId: string;
  status: 'queued';
  /** True when the row already existed under the same idempotency key. */
  deduped: boolean;
}

/**
 * Sole submit path for the normalize pipeline.
 *
 *   POST /api/logs/ingest          → receiveAlert  → 1 NormalizeJob, 1 enqueue
 *   POST /api/logs/ingest/batch    → receiveBatch  → N NormalizeJobs, N enqueues
 *
 * Idempotency
 * ───────────
 * Clients may pass an idempotency key:
 *  - For single ingest, via the `Idempotency-Key` HTTP header.
 *  - For batch items, via a per-item `idempotencyKey` field.
 *
 * If a row with the same key already exists, this service returns the
 * existing row's envelope WITHOUT enqueueing a second BullMQ job. The
 * dedup is enforced by a UNIQUE constraint on NormalizeJob.idempotencyKey,
 * so two concurrent requests with the same key resolve deterministically:
 * one INSERT wins, the other gets P2002 and falls through to the lookup.
 *
 * If no key is supplied, the server generates a UUID internally — this
 * makes idempotency strictly opt-in. The internal UUID will never collide,
 * so the P2002 path is never taken in that case.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly jobsService: JobsService,
    private readonly normalizeProducer: NormalizeProducer,
  ) {}

  async receiveAlert(
    dto: IngestDto,
    headerIdempotencyKey?: string,
  ): Promise<IngestResult> {
    return this.createAndEnqueue({
      rawLog: dto.rawContent,
      source: dto.source,
      format: dto.format ?? 'json',
      // Header takes precedence over body field; the body field exists
      // for batch items only.
      idempotencyKey: headerIdempotencyKey ?? dto.idempotencyKey,
    });
  }

  async receiveBatch(
    dto: IngestBatchDto,
  ): Promise<{ results: IngestResult[]; count: number }> {
    const results: IngestResult[] = [];

    // Sequential — keeps the cleanup-on-failure semantics simple and the
    // queue absorbs the bursts. The bottleneck is the worker anyway.
    for (const item of dto.items) {
      const result = await this.createAndEnqueue({
        rawLog: item.rawContent,
        source: item.source,
        format: item.format ?? 'json',
        idempotencyKey: item.idempotencyKey,
      });
      results.push(result);
    }

    return { results, count: results.length };
  }

  /**
   * Insert + enqueue with idempotency dedup and best-effort cleanup.
   *
   * Three paths:
   *  1. Happy: insert succeeds, enqueue succeeds → returns new jobId
   *  2. Dedup: insert hits P2002 (key collision) → fetch existing row,
   *     return its jobId without enqueueing
   *  3. Cleanup: insert succeeds but enqueue fails → delete the orphan
   *     row, propagate the original enqueue error
   */
  private async createAndEnqueue(input: {
    rawLog: Record<string, any>;
    source: string;
    format: string;
    idempotencyKey?: string;
  }): Promise<IngestResult> {
    const userKey = input.idempotencyKey;
    // If the caller didn't supply a key we generate one internally so the
    // INSERT path is uniform. The internal UUID will never collide, so the
    // dedup branch only fires for caller-supplied keys.
    const effectiveKey = userKey ?? randomUUID();

    let row;
    try {
      row = await this.jobsService.create({ ...input, idempotencyKey: effectiveKey });
    } catch (err) {
      if (userKey && IngestionService.isUniqueViolation(err)) {
        const existing = await this.jobsService.findByIdempotencyKey(userKey);
        if (existing) {
          this.logger.log(
            { jobId: existing.id, idempotencyKey: userKey, status: existing.status },
            'ingest.dedup_hit',
          );
          return { jobId: existing.id, status: 'queued', deduped: true };
        }
      }
      throw err;
    }

    try {
      await this.normalizeProducer.enqueue(row.id);
      this.logger.log(
        { jobId: row.id, source: row.source },
        'ingest.enqueued',
      );
      return { jobId: row.id, status: 'queued', deduped: false };
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

  private static isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
    );
  }
}
