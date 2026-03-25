import { Injectable } from "@nestjs/common";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { ConfigService } from "@nestjs/config";


@Injectable()
export class SQSClientService {
  private sqsClient: SQSClient
  private queueUrl: string

  constructor(private config: ConfigService){
    const awsRegion = this.config.get('AWS_REGION')
    const queueUrl = this.config.get('SQS_QUEUE_URL')

    if(!awsRegion) throw Error('AWS_REGION environment variable is required') 
    if(!queueUrl) throw Error('SQS_QUEUE_URL environment variable is required') 

    this.sqsClient = new SQSClient({region: awsRegion})
    this.queueUrl = queueUrl
  }


  async publish(ocsf: Record<string, any>): Promise<string | null>{
    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(ocsf),
    })

    const result = await this.sqsClient.send(command);    
    return result.MessageId ?? null
  }
}