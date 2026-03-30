import { Module } from '@nestjs/common';
import { ReprocessJob } from './reprocess.service';
import { NormalizationModule } from 'src/normalization/normalization.module';
import { SQSRetryJob } from './sqs-retry.service';

@Module({
  imports: [NormalizationModule],
  providers: [ReprocessJob, SQSRetryJob]
})
export class JobsModule {}
