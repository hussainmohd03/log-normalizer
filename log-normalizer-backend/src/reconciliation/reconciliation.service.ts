import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { PrismaService } from 'src/database/prisma.service';
import { NORMALIZE_QUEUE } from 'src/queue/queue-names';

/**
 * Reconciliation sweep — converges orphaned NormalizeJob rows to FAILED.
 *
 * Two orphan categories Week 1 leaves behind:
 *
 *   A) Stuck ACTIVE — worker crashed mid-processing. The row was claimed
 *      via markActive but markCompleted/markFailed never ran. Detected by
 *      `startedAt` older than RECONCILE_STUCK_ACTIVE_MINUTES.
 *
 *   B) Stuck QUEUED — extreme edge case from IngestionService.create where
 *      enqueue() threw AND the cleanup deleteQuietly() also threw. The DB
 *      row exists but no BullMQ job was ever created. Detected by
 *      `createdAt` older than RECONCILE_STUCK_QUEUED_MINUTES AND no
 *      matching BullMQ job in Redis.
 *
 * Race safety
 * ───────────
 * Both sweeps use the same atomic updateMany + WHERE-status guard pattern
 * as JobsService.markActive/markCompleted/markFailed. If the worker
 * completes a job between our SELECT and our UPDATE, the WHERE clause
 * filters it out, the updateMany affects 0 rows, and we move on. There is
 * no read-then-write window where we can clobber a worker's transition.
 *
 * Concurrency
 * ───────────
 * `running` flag prevents two cron ticks from overlapping. If a sweep
 * takes longer than the cron interval (shouldn't happen — sweep A is one
 * UPDATE, sweep B is bounded), the next tick is a no-op.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private running = false;

  private readonly stuckActiveMs: number;
  private readonly stuckQueuedMs: number;
  private readonly idempotencyKeyTtlMs: number;
  private readonly batchSize: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(NORMALIZE_QUEUE) private readonly queue: Queue,
  ) {
    this.stuckActiveMs =
      (parseInt(this.config.get<string>('RECONCILE_STUCK_ACTIVE_MINUTES') ?? '') || 15) *
      60_000;
    this.stuckQueuedMs =
      (parseInt(this.config.get<string>('RECONCILE_STUCK_QUEUED_MINUTES') ?? '') || 60) *
      60_000;
    this.idempotencyKeyTtlMs =
      (parseInt(this.config.get<string>('IDEMPOTENCY_KEY_RETENTION_HOURS') ?? '') || 24) *
      60 * 60_000;
    this.batchSize =
      parseInt(this.config.get<string>('RECONCILE_BATCH_SIZE') ?? '') || 100;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    if (this.running) {
      this.logger.debug('reconciliation.skip: previous sweep still running');
      return;
    }
    this.running = true;
    const startedAt = Date.now();

    try {
      const activeFixed = await this.sweepActive();
      const queuedFixed = await this.sweepQueued();
      const keysExpired = await this.sweepIdempotencyKeys();

      this.logger.log(
        {
          activeOrphansFixed: activeFixed,
          queuedOrphansFixed: queuedFixed,
          idempotencyKeysExpired: keysExpired,
          durationMs: Date.now() - startedAt,
        },
        'reconciliation.sweep.complete',
      );
    } catch (err) {
      this.logger.error(
        { err: (err as Error).message, durationMs: Date.now() - startedAt },
        'reconciliation.sweep.failed',
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Sweep A — stuck ACTIVE rows. Single atomic UPDATE; the WHERE clause
   * IS the race guard. Returns the number of rows actually transitioned.
   */
  async sweepActive(): Promise<number> {
    const cutoff = new Date(Date.now() - this.stuckActiveMs);

    const { count } = await this.prisma.normalizeJob.updateMany({
      where: {
        status: 'ACTIVE',
        startedAt: { lt: cutoff },
      },
      data: {
        status: 'FAILED',
        error: 'reconciliation: worker heartbeat lost',
        completedAt: new Date(),
      },
    });

    if (count > 0) {
      this.logger.warn(
        { fixed: count, cutoff: cutoff.toISOString() },
        'reconciliation.active_orphans',
      );
    }

    return count;
  }

  /**
   * Sweep B — stuck QUEUED rows that have no matching BullMQ job. Bounded
   * by RECONCILE_BATCH_SIZE per run; the next tick picks up the next batch
   * if there's a backlog.
   */
  async sweepQueued(): Promise<number> {
    const cutoff = new Date(Date.now() - this.stuckQueuedMs);

    const candidates = await this.prisma.normalizeJob.findMany({
      where: { status: 'QUEUED', createdAt: { lt: cutoff } },
      take: this.batchSize,
      select: { id: true, createdAt: true },
    });

    if (candidates.length === 0) return 0;

    let fixed = 0;
    for (const row of candidates) {
      const bullJob = await this.queue.getJob(row.id);
      if (bullJob) {
        // BullMQ has it — it will eventually run or fail naturally.
        continue;
      }

      // No BullMQ job. Mark FAILED with the same WHERE-status guard so we
      // can't clobber a concurrent worker transition.
      const { count } = await this.prisma.normalizeJob.updateMany({
        where: { id: row.id, status: 'QUEUED' },
        data: {
          status: 'FAILED',
          error: 'reconciliation: enqueue orphan',
          completedAt: new Date(),
        },
      });

      if (count === 1) {
        fixed++;
        this.logger.warn(
          {
            jobId: row.id,
            createdAt: row.createdAt.toISOString(),
            ageMs: Date.now() - row.createdAt.getTime(),
          },
          'reconciliation.queued_orphan',
        );
      }
    }

    return fixed;
  }

  /**
   * Sweep C — TTL cleanup for idempotency keys.
   *
   * After IDEMPOTENCY_KEY_RETENTION_HOURS, NULL out the idempotencyKey
   * column on rows older than the cutoff. The row stays for audit/history
   * — only the unique key is released so it can be reused by a future
   * client retry that wants the same logical operation ID.
   *
   * Single atomic UPDATE; no race concerns (worker doesn't touch this
   * column).
   */
  async sweepIdempotencyKeys(): Promise<number> {
    const cutoff = new Date(Date.now() - this.idempotencyKeyTtlMs);

    const { count } = await this.prisma.normalizeJob.updateMany({
      where: {
        idempotencyKey: { not: null },
        createdAt: { lt: cutoff },
      },
      data: { idempotencyKey: null },
    });

    if (count > 0) {
      this.logger.log(
        { expired: count, cutoff: cutoff.toISOString() },
        'reconciliation.idempotency_keys_expired',
      );
    }

    return count;
  }
}
