import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NormalizeProducer } from './normalize.producer';
import { NORMALIZE_QUEUE } from './queue-names';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>('REDIS_URL') },
      }),
    }),
    BullModule.registerQueue({ name: NORMALIZE_QUEUE }),
  ],
  providers: [NormalizeProducer],
  exports: [NormalizeProducer],
})
export class QueueModule {}
