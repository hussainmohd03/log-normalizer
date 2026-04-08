import { Injectable, Logger } from '@nestjs/common';
import { NormalizeJob } from 'generated/prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { CompleteNormalizeJobDto } from './dto/complete-normalize-job.dto';
import { CreateNormalizeJobDto } from './dto/create-normalize-job.dto';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateNormalizeJobDto): Promise<NormalizeJob> {
    return this.prisma.normalizeJob.create({
      data: {
        rawLog: dto.rawLog,
        source: dto.source,
        format: dto.format,
        idempotencyKey: dto.idempotencyKey,
      },
    });
  }

  async findById(id: string): Promise<NormalizeJob | null> {
    return this.prisma.normalizeJob.findUnique({ where: { id } });
  }

  async findByIdempotencyKey(key: string): Promise<NormalizeJob | null> {
    return this.prisma.normalizeJob.findUnique({ where: { idempotencyKey: key } });
  }

  /**
   * Precondition: job must be in QUEUED state.
   * Uses a WHERE-clause guard so the check is atomic — no separate read.
   * Throws if the job is not found or not in QUEUED state.
   */
  async markActive(id: string): Promise<NormalizeJob> {
    const { count } = await this.prisma.normalizeJob.updateMany({
      where: { id, status: 'QUEUED' },
      data: { status: 'ACTIVE', startedAt: new Date() },
    });

    if (count === 0) {
      throw new Error(`markActive: job ${id} not found or not in QUEUED state`);
    }

    return this.prisma.normalizeJob.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Precondition: job must be in ACTIVE state.
   * Writes the full result payload atomically with the status transition.
   * Returns the updated row so the caller can log or forward it.
   */
  async markCompleted(
    id: string,
    result: CompleteNormalizeJobDto,
  ): Promise<NormalizeJob> {
    const { count } = await this.prisma.normalizeJob.updateMany({
      where: { id, status: 'ACTIVE' },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        ocsf: result.ocsf,
        confidence: result.confidence,
        decision: result.decision,
        breakdown: result.breakdown,
        validationErrors: result.validationErrors,
        processingTimeMs: result.processingTimeMs,
      },
    });

    if (count === 0) {
      throw new Error(
        `markCompleted: job ${id} not found or not in ACTIVE state`,
      );
    }

    return this.prisma.normalizeJob.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Precondition: job must be in ACTIVE state.
   * Stores the error message and sets completedAt so the row has a closed
   * timestamp regardless of outcome.
   */
  async markFailed(id: string, error: string): Promise<NormalizeJob> {
    const { count } = await this.prisma.normalizeJob.updateMany({
      where: { id, status: 'ACTIVE' },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error,
      },
    });

    if (count === 0) {
      throw new Error(
        `markFailed: job ${id} not found or not in ACTIVE state`,
      );
    }

    return this.prisma.normalizeJob.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Best-effort cleanup used in the enqueue error path.
   * Never throws — a failure here must not mask the original error.
   */
  async deleteQuietly(id: string): Promise<void> {
    try {
      await this.prisma.normalizeJob.delete({ where: { id } });
    } catch (err: unknown) {
      this.logger.warn(
        { jobId: id, err: (err as Error).message },
        'jobs.delete_quietly_failed',
      );
    }
  }
}
