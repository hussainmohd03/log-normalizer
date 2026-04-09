import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * SQS publisher used by the routing chain.
 *
 * Idempotency
 * ───────────
 * The caller passes a `dedupId` (the NormalizeJob id) so that BullMQ
 * retries don't produce duplicate downstream events. AWS SQS's native
 * deduplication ONLY works on FIFO queues — we detect this from the
 * configured queue URL suffix (`.fifo`) and conditionally attach
 * `MessageDeduplicationId` + `MessageGroupId`.
 *
 * On a standard queue the dedup id is silently ignored. A startup
 * warning is logged so the operator knows retries can publish twice.
 * Documented Week 2 limitation; switching to a FIFO queue closes the
 * gap with zero code changes here.
 */
@Injectable()
export class SQSClientService {
  private readonly logger = new Logger(SQSClientService.name);
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;
  private readonly isFifo: boolean;

  constructor(private config: ConfigService) {
    const awsRegion = this.config.get<string>('AWS_REGION');
    const queueUrl = this.config.get<string>('SQS_QUEUE_URL');

    if (!awsRegion) throw new Error('AWS_REGION environment variable is required');
    if (!queueUrl) throw new Error('SQS_QUEUE_URL environment variable is required');

    this.sqsClient = new SQSClient({ region: awsRegion });
    this.queueUrl = queueUrl;
    this.isFifo = queueUrl.endsWith('.fifo');

    if (!this.isFifo) {
      this.logger.warn(
        { queueUrl },
        'sqs.standard_queue: BullMQ retries may publish duplicate events. Use a FIFO queue (URL must end with .fifo) for native deduplication.',
      );
    }
  }

  /**
   * Publishes the OCSF payload to SQS. `dedupId` is used as the
   * MessageDeduplicationId on FIFO queues; ignored on standard queues.
   * Returns the SQS message id, or null on transport-layer success
   * with no id (shouldn't happen but defensive).
   */
  async publish(ocsf: Record<string, any>, dedupId?: string): Promise<string | null> {
    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(ocsf),
      ...(this.isFifo && dedupId
        ? {
            MessageDeduplicationId: dedupId,
            // FIFO requires a group id. Using a single static group keeps
            // ordering global; if you want per-source ordering, switch to
            // ocsf.metadata.product.vendor_name or similar.
            MessageGroupId: 'normalize-default',
          }
        : {}),
    });

    const result = await this.sqsClient.send(command);
    return result.MessageId ?? null;
  }
}
