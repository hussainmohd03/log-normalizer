import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NORMALIZE_QUEUE } from 'src/queue/queue-names';
import { ReconciliationService } from './reconciliation.service';

/**
 * Wires the reconciliation cron. Registers the normalize queue locally
 * so the service can @InjectQueue for the BullMQ existence check in
 * sweep B. The BullMQ root connection is already configured globally by
 * QueueModule's BullModule.forRootAsync.
 */
@Module({
  imports: [BullModule.registerQueue({ name: NORMALIZE_QUEUE })],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
