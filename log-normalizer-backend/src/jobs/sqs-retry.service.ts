import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DECISION } from 'generated/prisma/enums';
import { nonBlocking } from 'src/common/utils/non-blocking';
import { PrismaService } from 'src/database/prisma.service';
import { SQSClientService } from 'src/delivery/sqs-client.service';

@Injectable()
export class SQSRetryJob {
  private batchSize: number;
  private running: boolean = false;
  private readonly logger = new Logger(SQSRetryJob.name);

  constructor(
    private prisma: PrismaService,
    private SQSClient: SQSClientService,
    private config: ConfigService,
  ) {
    this.batchSize = parseInt(this.config.get('SQS_BATCH_SIZE')!) || 10;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async republish() {
    try {
      if (this.running) return;
      this.running = true;
      const unpublished = await this.prisma.oCSFEvent.findMany({
        where: {
          publishedToSqs: false,
          decision: { in: [DECISION.ACCEPT, DECISION.CORRECTED] },
        },
        take: this.batchSize,
      });

      if (unpublished.length === 0) return;

      for (const log of unpublished) {
        const ocsf = log.ocsfJson as Record<string, any>;
        const messageId = await nonBlocking(
          () => this.SQSClient.publish(ocsf),
          `OCSF Event-${log.id}/sqs-retry`,
          this.logger,
        );

        if (messageId) {
          await this.prisma.oCSFEvent.update({
            where: { id: log.id },
            data: { publishedToSqs: true, sqsMessageId: messageId },
          });
        }
      }

      this.logger.log(`Retried ${unpublished.length} unpublished events`);
    } catch (error) {
      this.logger.error(`SQS Retry job failed: ${error.message}`);
    } finally {
      this.running = false;
    }
  }
}
