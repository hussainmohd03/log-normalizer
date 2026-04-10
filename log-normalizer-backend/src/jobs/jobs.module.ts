import { Module } from '@nestjs/common';
import { DeliveryModule } from 'src/delivery/delivery.module';
import { QueueModule } from 'src/queue/queue.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { SQSRetryJob } from './sqs-retry.service';

@Module({
  imports: [DeliveryModule, QueueModule],
  controllers: [JobsController],
  providers: [SQSRetryJob, JobsService],
  exports: [JobsService],
})
export class JobsModule {}
