import { Module } from '@nestjs/common';
import { DeliveryModule } from 'src/delivery/delivery.module';
import { QueueModule } from 'src/queue/queue.module';
import { JobRetryService } from './job-retry.service';
import { JobsController } from './jobs.controller';
import { JobsEventsService } from './jobs-events.service';
import { JobsService } from './jobs.service';
import { SQSRetryJob } from './sqs-retry.service';

@Module({
  imports: [DeliveryModule, QueueModule],
  controllers: [JobsController],
  providers: [SQSRetryJob, JobsService, JobsEventsService, JobRetryService],
  exports: [JobsService],
})
export class JobsModule {}
