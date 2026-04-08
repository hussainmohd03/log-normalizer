import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from 'src/database/database.module';
import { JobsService } from 'src/jobs/jobs.service';
import { NORMALIZE_QUEUE } from 'src/queue/queue-names';
import { RoutingModule } from 'src/routing/routing.module';
import { SLMModule } from 'src/slm/slm.module';
import { NormalizeProcessor } from './normalize.processor';

/**
 * Slim module booted by the worker entry process. Pulls in only what
 * the processor needs:
 *  - DatabaseModule for PrismaService (transitively)
 *  - SLMModule for the HTTP client + circuit breaker
 *  - RoutingModule for the OCSFEvent / ManualReview / SQS chain
 *  - BullModule for the queue connection
 *  - JobsService for the row CRUD
 *
 * Intentionally does NOT import JobsModule — that would drag in the
 * legacy ReprocessJob/SQSRetryJob cron providers and the SSE
 * controller, none of which the worker process needs.
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    SLMModule,
    RoutingModule,
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
