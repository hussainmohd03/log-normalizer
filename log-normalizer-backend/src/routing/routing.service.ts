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

  /**
   * Called by the worker after a successful SLM call. Writes the
   * downstream artifacts (OCSFEvent + ProcessingMetric, optional
   * ManualReview) and triggers the SQS publish for accept decisions.
   *
   * The NormalizeJob row's status is owned by the worker — this method
   * does not touch it. If routing throws, the worker maps the failure
   * onto markFailed.
   */
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
      () => this.SQSClient.publish(slmResponse.ocsf!),
      `${job.source}/sqs`,
      this.logger,
    );

    if (messageId) {
      await nonBlocking(
        () =>
          this.prisma.oCSFEvent.update({
            where: { normalizeJobId: job.id },
            data: { publishedToSqs: true, sqsMessageId: messageId },
          }),
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
    const ops: Promise<unknown>[] = [];

    if (slmResponse.ocsf) {
      ops.push(
        this.prisma.oCSFEvent.create({
          data: {
            normalizeJobId: job.id,
            classUid: slmResponse.ocsf['class_uid'],
            className: slmResponse.ocsf['class_name'],
            activityId: slmResponse.ocsf['activity_id'],
            activityName: slmResponse.ocsf['activity_name'],
            severityId: slmResponse.ocsf['severity_id'],
            ocsfJson: slmResponse.ocsf,
            confidence: slmResponse.confidence,
            decision: this.mapDecision(slmResponse.decision),
            processingTime: slmResponse.processing_time_ms,
          },
        }),
      );
    }

    ops.push(
      this.prisma.processingMetric.create({
        data: {
          source: job.source,
          confidence: slmResponse.confidence,
          decision: this.mapDecision(slmResponse.decision),
          latencyMs: slmResponse.processing_time_ms,
          success: slmResponse.decision === 'accept',
        },
      }),
    );

    await this.prisma.$transaction(ops as never);
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
