import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PRIORITY, RawLog } from 'generated/prisma/browser';
import { SLMResponse } from 'src/common/interfaces/slm-response.interface';
import { nonBlocking } from 'src/common/utils/non-blocking';
import { PrismaService } from 'src/database/prisma.service';
import { SQSClientService } from 'src/delivery/sqs-client.service';
import { SLMService } from 'src/slm/slm.service';

@Injectable()
export class ReviewService {
  private readonly logger = new Logger('ReviewService')

  constructor(private prisma: PrismaService, private slmService: SLMService){}

  async queue(rawLog: RawLog, slmResponse: SLMResponse, priority: PRIORITY) {

    await this.prisma.manualReview.create({
        data: {
        rawLogId: rawLog.id,
        source: rawLog.source, 
        slmOcsfOutput: slmResponse.ocsf as Record<string, any>, 
        confidence: slmResponse.confidence,
        confidenceBreakdown: slmResponse.breakdown as Record<string, any>,
        validationErrors: slmResponse.validation_errors as string[],
        priority: priority,
      }
    })

    this.logger.log(`[${rawLog.id}] Queued for review (${priority})`);
  }
  
  async getPending(limit: number = 20) {
    return this.prisma.manualReview.findMany({
      where: { reviewedAt: null },
      orderBy: [
        { priority: 'desc' },      // HIGH before NORMAL
        { confidence: 'asc' },     // lowest confidence first within same priority
      ],
      take: limit,
      include: { rawLog: true },
    })
  }

  async submitCorrection(reviewId: string, correctedOcsf: Record<string, any>, reviewer: string){ 
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
    })

    await this.prisma.oCSFEvent.upsert({
    where: { rawLogId: updated.rawLogId },
      update: {
        ocsfJson: correctedOcsf,
        confidence: 1.0,
        decision: 'corrected',
        publishedToSqs: false,
        sqsMessageId: null,
      },
      create: {
        rawLogId: updated.rawLogId,
        classUid: correctedOcsf['class_uid'],
        className: correctedOcsf['class_name'],
        activityId: correctedOcsf['activity_id'],
        activityName: correctedOcsf['activity_name'],
        severityId: correctedOcsf['severity_id'],
        ocsfJson: correctedOcsf,
        confidence: 1.0,
        decision: 'corrected',
        processingTime: 0,
        publishedToSqs: false,
      },
    })


    return updated;
  }
}
