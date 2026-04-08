import { Module } from '@nestjs/common';
import { ReprocessJob } from './reprocess.service';
import { NormalizationModule } from 'src/normalization/normalization.module';
import { SQSRetryJob } from './sqs-retry.service';
import { DeliveryModule } from 'src/delivery/delivery.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [NormalizationModule, DeliveryModule],
  controllers: [JobsController],
  providers: [ReprocessJob, SQSRetryJob, JobsService],
  exports: [JobsService],
})
export class JobsModule {}
