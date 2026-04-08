import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from 'src/database/database.module';
import { JobsService } from 'src/jobs/jobs.service';
import { NORMALIZE_QUEUE } from 'src/queue/queue-names';
import { SLMModule } from 'src/slm/slm.module';
import { NormalizeProcessor } from './normalize.processor';

/**
 * Slim module booted by the worker entry process. Pulls in only what
 * the processor needs:
 *  - DatabaseModule for PrismaService (transitively)
 *  - SLMModule for the HTTP client + circuit breaker
 *  - BullModule for the queue connection
 *  - JobsService for the row CRUD (registered directly so we don't drag
 *    in legacy reprocess/sqs jobs from JobsModule)
 *
 * This is intentionally NOT JobsModule — the worker process should boot
 * the smallest possible graph.
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    SLMModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>('REDIS_URL') },
      }),
    }),
    BullModule.registerQueue({ name: NORMALIZE_QUEUE }),
  ],
  providers: [JobsService, NormalizeProcessor],
})
export class WorkerModule {}
