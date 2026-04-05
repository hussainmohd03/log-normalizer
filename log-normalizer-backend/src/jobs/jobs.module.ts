import { Module } from '@nestjs/common';
import { ReprocessJob } from './reprocess.service';
import { NormalizationModule } from 'src/normalization/normalization.module';
import { SQSRetryJob } from './sqs-retry.service';
import { DeliveryModule } from 'src/delivery/delivery.module';

@Module({
  imports: [NormalizationModule, DeliveryModule],
  providers: [ReprocessJob, SQSRetryJob],
})
export class JobsModule {}
