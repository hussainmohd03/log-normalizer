import { Injectable, Logger } from '@nestjs/common';
import { DECISION, NormalizeJob, PRIORITY } from 'generated/prisma/client';
import { SLMResponse } from 'src/common/interfaces/slm-response.interface';
import { nonBlocking } from 'src/common/utils/non-blocking';
import { PrismaService } from 'src/database/prisma.service';
import { SQSClientService } from 'src/delivery/sqs-client.service';
import { ReviewService } from 'src/review/review.service';

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private prisma: PrismaService,
    private reviewService: ReviewService,
    private SQSClient: SQSClientService,
  ) {}


  async route(job: NormalizeJob, slmResponse: SLMResponse): Promise<void> {
    await this.storeTransaction(job, slmResponse);

    switch (slmResponse.decision) {
      case 'accept':
        await this.handleAccept(job, slmResponse);
        break;
      case 'review':
        await this.handleReview(job, slmResponse, PRIORITY.NORMAL);
        break;
      case 'reject':
        await this.handleReview(job, slmResponse, PRIORITY.HIGH);
        break;
      default:
        this.logger.warn(
          { jobId: job.id, decision: slmResponse.decision },
          'routing.unknown_decision',
        );
        await this.handleReview(job, slmResponse, PRIORITY.HIGH);
    }
  }

  private async handleAccept(job: NormalizeJob, slmResponse: SLMResponse): Promise<void> {

    const messageId = await nonBlocking(
      () => this.SQSClient.publish(slmResponse.ocsf!, job.id),
      `${job.source}/sqs`,
      this.logger,
    );

    if (messageId) {
      await nonBlocking(
        async () => {
          const event = await this.prisma.oCSFEvent.findFirst({
            where: { normalizeJobId: job.id, supersedesEventId: null },
            select: { id: true },
          });
          if (event) {
            await this.prisma.oCSFEvent.update({
              where: { id: event.id },
              data: { publishedToSqs: true, sqsMessageId: messageId },
            });
          }
        },
        `${job.source}/sqs-track`,
        this.logger,
      );
    }
  }

  private async handleReview(
    job: NormalizeJob,
    slmResponse: SLMResponse,
    priority: PRIORITY,
  ): Promise<void> {
    await this.reviewService.queue(job, slmResponse, priority);
  }


  private async storeTransaction(job: NormalizeJob, slmResponse: SLMResponse): Promise<void> {
    const decision = this.mapDecision(slmResponse.decision);

    await this.prisma.$transaction(async (tx) => {
      if (slmResponse.ocsf) {
        const ocsfData = {
          classUid: slmResponse.ocsf['class_uid'],
          className: slmResponse.ocsf['class_name'],
          activityId: slmResponse.ocsf['activity_id'],
          activityName: slmResponse.ocsf['activity_name'],
          severityId: slmResponse.ocsf['severity_id'],
          ocsfJson: slmResponse.ocsf,
          confidence: slmResponse.confidence,
          decision,
          processingTime: slmResponse.processing_time_ms,
        };
        const existing = await tx.oCSFEvent.findFirst({
          where: { normalizeJobId: job.id },
          select: { id: true },
        });
        if (existing) {
          await tx.oCSFEvent.update({
            where: { id: existing.id },
            data: {
              ...ocsfData,
              // Reset publish state on retry — the new payload may differ
              // from what was already sent to SQS, so we re-publish.
              publishedToSqs: false,
              sqsMessageId: null,
            },
          });
        } else {
          await tx.oCSFEvent.create({
            data: { normalizeJobId: job.id, ...ocsfData },
          });
        }
      }

      const metricData = {
        source: job.source,
        confidence: slmResponse.confidence,
        decision,
        latencyMs: slmResponse.processing_time_ms,
        success: slmResponse.decision === 'accept',
      };
      await tx.processingMetric.upsert({
        where: { normalizeJobId: job.id },
        create: { normalizeJobId: job.id, ...metricData },
        update: metricData,
      });
    });
  }

  private mapDecision(decision: string): DECISION {
    const map: Record<string, DECISION> = {
      accept: DECISION.ACCEPT,
      review: DECISION.REVIEW,
      reject: DECISION.REJECT,
    };
    return map[decision] || DECISION.REJECT;
  }
}
