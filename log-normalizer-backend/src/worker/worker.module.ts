import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from 'src/database/database.module';
import { JobsService } from 'src/jobs/jobs.service';
import { NORMALIZE_QUEUE } from 'src/queue/queue-names';
import { RoutingModule } from 'src/routing/routing.module';
import { SLMModule } from 'src/slm/slm.module';
import { NormalizeProcessor } from './normalize.processor';


@Module({
  imports: [

    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    SLMModule,
    RoutingModule,
    BullModule.forRootAsync({
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
