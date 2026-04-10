import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DECISION, NormalizeJob, PRIORITY } from 'generated/prisma/client';
import { SLMResponse } from 'src/common/interfaces/slm-response.interface';
import { PrismaService } from 'src/database/prisma.service';
import { SLMService } from 'src/slm/slm.service';

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(private prisma: PrismaService, private slmService: SLMService) {}


  async queue(job: NormalizeJob, slmResponse: SLMResponse, priority: PRIORITY): Promise<void> {
    const data = {
      source: job.source,
      slmOcsfOutput: slmResponse.ocsf as Record<string, any>,
      confidence: slmResponse.confidence,
      confidenceBreakdown: slmResponse.breakdown as Record<string, any>,
      validationErrors: slmResponse.validation_errors as string[],
      priority,
    };

    await this.prisma.manualReview.upsert({
      where: { normalizeJobId: job.id },
      create: { normalizeJobId: job.id, ...data },
      update: data,
    });

    this.logger.log(
      { jobId: job.id, priority },
      'review.queued',
    );
  }

  async getPending(limit: number = 20) {
    return this.prisma.manualReview.findMany({
      where: { reviewedAt: null },
      orderBy: [
        { priority: 'desc' },  // HIGH before NORMAL
        { confidence: 'asc' }, // lowest confidence first within same priority
      ],
      take: limit,
      include: { normalizeJob: true },
    });
  }

  async submitCorrection(reviewId: string, correctedOcsf: Record<string, any>, reviewer: string) {
    const validation = await this.slmService.validate(correctedOcsf);

    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Corrected OCSF failed validation',
        errors: validation.errors,
      });
    }

    const review = await this.prisma.manualReview.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }

    if (review.reviewedAt) {
      throw new BadRequestException(`Review ${reviewId} already corrected`);
    }

    const updated = await this.prisma.manualReview.update({
      where: { id: reviewId },
      data: {
        correctedOCSF: correctedOcsf,
        reviewedBy: reviewer,
        reviewedAt: new Date(),
      },
    });

    const existing = await this.prisma.oCSFEvent.findFirst({
      where: { normalizeJobId: updated.normalizeJobId },
      orderBy: { normalizedAt: 'desc' },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.oCSFEvent.update({
        where: { id: existing.id },
        data: {
          ocsfJson: correctedOcsf,
          confidence: 1.0,
          decision: DECISION.CORRECTED,
          publishedToSqs: false,
          sqsMessageId: null,
        },
      });
    } else {
      await this.prisma.oCSFEvent.create({
        data: {
          normalizeJobId: updated.normalizeJobId,
          classUid: correctedOcsf['class_uid'],
          className: correctedOcsf['class_name'],
          activityId: correctedOcsf['activity_id'],
          activityName: correctedOcsf['activity_name'],
          severityId: correctedOcsf['severity_id'],
          ocsfJson: correctedOcsf,
          confidence: 1.0,
          decision: DECISION.CORRECTED,
          processingTime: 0,
          publishedToSqs: false,
        },
      });
    }

    return updated;
  }

  async flagForReview(jobId: string, flaggedByUserId: string, reason?: string) {
    const job = await this.prisma.normalizeJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    if (job.status !== 'COMPLETED') {
      throw new BadRequestException(`Job ${jobId} is not completed (status: ${job.status})`);
    }

    try {
      return await this.prisma.manualReview.create({
        data: {
          normalizeJobId: jobId,
          source: job.source,
          slmOcsfOutput: job.ocsf ?? {},
          confidence: job.confidence ?? 0,
          correctionType: 'HUMAN_FLAGGED',
          flaggedById: flaggedByUserId,
          validationErrors: reason ? [reason] : undefined,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException(`Job ${jobId} already has a review`);
      }
      throw err;
    }
  }
}
