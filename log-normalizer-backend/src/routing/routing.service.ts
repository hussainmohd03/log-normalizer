import { Injectable, Logger } from '@nestjs/common';
import { AccumulatorService } from 'src/accumulator/accumulator.service';
import { PrismaService } from 'src/database/prisma.service';
import { SQSClientService } from 'src/delivery/sqs-client.service';
import { ReviewService } from 'src/review/review.service';
import { nonBlocking } from 'src/common/utils/non-blocking';
import { PRIORITY, RawLog, STATUS } from 'generated/prisma/browser';
import { SLMResponse } from 'src/common/interfaces/slm-response.interface';

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name)

  constructor(
    private prisma: PrismaService, 
    private reviewService: ReviewService, 
    private SQSClient: SQSClientService, 
    private accumulatorService: AccumulatorService) {}
  

  async route(rawLog: RawLog, slmResponse: SLMResponse) {
    // run storeTransaction
    await this.storeTransaction(rawLog, slmResponse)

    const decision = slmResponse.decision

    // handle routing
    switch (decision) {
      case 'accept':
        await this.handleAccept(rawLog, slmResponse);
        break;
      case 'review':
        await this.handleReview(rawLog, slmResponse, PRIORITY.NORMAL);
        break;
      case 'reject':
        await this.handleReview(rawLog, slmResponse, PRIORITY.HIGH);
        break;
      default:
        this.logger.warn(`[${rawLog.id}] Unexpected decision: ${decision} — routing to HIGH review`);
        await this.handleReview(rawLog, slmResponse, PRIORITY.HIGH);
    }
  } 

  private async handleAccept(rawLog: RawLog, slmResponse: SLMResponse){
    const messageId = await nonBlocking(
      () => this.SQSClient.publish(slmResponse.ocsf!),
      `${rawLog.source}/sqs`,
      this.logger
    )

    if(messageId) {
      await nonBlocking(
        () => this.prisma.oCSFEvent.update({
          where: { rawLogId: rawLog.id },
          data: { publishedToSqs: true, sqsMessageId: messageId }
        }),
        `${rawLog.source}/sqs-track`,
        this.logger
      )
    }

    await nonBlocking(
      () => this.accumulatorService.buffer(
        rawLog.source,
        rawLog.rawContent as Record<string, any>,
        slmResponse.ocsf!,
        slmResponse.confidence
      ),
      `${rawLog.source}/accumulate`,
      this.logger
    )
  }

  private async handleReview(rawLog: RawLog, slmResponse: SLMResponse, priority: PRIORITY){
    await this.reviewService.queue(rawLog, slmResponse, priority)
  }

  
  private async storeTransaction(rawLog: RawLog, slmResponse: SLMResponse) {
    const ops = [];

    if (slmResponse.ocsf) {
      ops.push(
        this.prisma.oCSFEvent.create({
          data: {
            rawLogId: rawLog.id,
            classUid: slmResponse.ocsf['class_uid'],
            className: slmResponse.ocsf['class_name'],
            activityId: slmResponse.ocsf['activity_id'],
            activityName: slmResponse.ocsf['activity_name'],
            severityId: slmResponse.ocsf['severity_id'],
            ocsfJson: slmResponse.ocsf,
            confidence: slmResponse.confidence,
            decision: slmResponse.decision,
            processingTime: slmResponse.processing_time_ms,
          },
        }),
      )
    }

    ops.push(
      this.prisma.processingMetric.create({
        data: {
          source: rawLog.source,
          confidence: slmResponse.confidence,
          decision: slmResponse.decision,
          latencyMs: slmResponse.processing_time_ms,
          success: slmResponse.decision === 'accept',
        },
      }),
    )

    ops.push(
      this.prisma.rawLog.update({
        where: { id: rawLog.id },
        data: {
          status: slmResponse.ocsf ? STATUS.PROCESSED : STATUS.FAILED,
          processedAt: new Date(),
          errorMessage: slmResponse.ocsf ? null : (slmResponse.error || 'No OCSF output produced'),
        },
      })
    )

    await this.prisma.$transaction(ops);
  }
  
}
