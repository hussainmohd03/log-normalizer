import { Module } from '@nestjs/common';
import { DeliveryModule } from 'src/delivery/delivery.module';
import { JobsController } from './jobs.controller';
import { JobsEventsService } from './jobs-events.service';
import { JobsService } from './jobs.service';
import { SQSRetryJob } from './sqs-retry.service';

@Module({
  imports: [DeliveryModule],
  controllers: [JobsController],
  providers: [SQSRetryJob, JobsService, JobsEventsService],
  exports: [JobsService],
})
export class JobsModule {}
