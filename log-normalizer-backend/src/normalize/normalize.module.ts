import { Module } from '@nestjs/common';
import { JobsModule } from 'src/jobs/jobs.module';
import { QueueModule } from 'src/queue/queue.module';
import { NormalizeController } from './normalize.controller';
import { NormalizeService } from './normalize.service';

@Module({
  imports: [JobsModule, QueueModule],
  controllers: [NormalizeController],
  providers: [NormalizeService],
})
export class NormalizeModule {}
