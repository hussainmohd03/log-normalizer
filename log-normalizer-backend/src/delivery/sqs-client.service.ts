import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";


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


  async publish(
    ocsf: Record<string, any>,
    dedupId?: string,
    messageAttributes?: Record<string, string>,
  ): Promise<string | null> {
    const sqsAttributes: Record<string, { DataType: string; StringValue: string }> = {};
    if (messageAttributes) {
      for (const [key, value] of Object.entries(messageAttributes)) {
        sqsAttributes[key] = { DataType: 'String', StringValue: value };
      }
    }

    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(ocsf),
      ...(Object.keys(sqsAttributes).length > 0 ? { MessageAttributes: sqsAttributes } : {}),
      ...(this.isFifo && dedupId
        ? {
            MessageDeduplicationId: dedupId,
            MessageGroupId: 'normalize-default',
          }
        : {}),
    });

    const result = await this.sqsClient.send(command);
    return result.MessageId ?? null;
  }
}
