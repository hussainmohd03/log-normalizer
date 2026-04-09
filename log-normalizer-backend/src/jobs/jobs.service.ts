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


  async markActive(id: string): Promise<NormalizeJob> {
    const { count } = await this.prisma.normalizeJob.updateMany({
      where: { id, status: { in: ['QUEUED', 'ACTIVE'] } },
      data: {
        status: 'ACTIVE',
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    if (count === 0) {
      throw new Error(`markActive: job ${id} not found or in terminal state`);
    }

    return this.prisma.normalizeJob.findUniqueOrThrow({ where: { id } });
  }

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
        fixesApplied: result.fixesApplied,
        hallucinationsStripped: result.hallucinationsStripped,
      },
    });

    if (count === 0) {
      throw new Error(
        `markCompleted: job ${id} not found or not in ACTIVE state`,
      );
    }

    return this.prisma.normalizeJob.findUniqueOrThrow({ where: { id } });
  }


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
