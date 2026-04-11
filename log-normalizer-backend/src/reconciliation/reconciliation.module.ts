import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NORMALIZE_QUEUE } from 'src/queue/queue-names';
import { ReconciliationService } from './reconciliation.service';


@Module({
  imports: [BullModule.registerQueue({ name: NORMALIZE_QUEUE })],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
