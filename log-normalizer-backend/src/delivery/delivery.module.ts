import { Module } from '@nestjs/common';
import { SQSClientService } from './sqs-client.service';

@Module({
  providers: [SQSClientService], 
  exports: [SQSClientService]
})
export class DeliveryModule {}
