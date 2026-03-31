import { Module } from '@nestjs/common';
import { IngestionModule } from './ingestion/ingestion.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { NormalizationModule } from './normalization/normalization.module';
import { RoutingModule } from './routing/routing.module';
import { DeliveryModule } from './delivery/delivery.module';
import { ReviewModule } from './review/review.module';
import { SLMModule } from './slm/slm.module';
import { AccumulatorModule } from './accumulator/accumulator.module';
import { JobsModule } from './jobs/jobs.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MetricsModule } from './metrics/metrics.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true}),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 1000 }],  // 1000 requests per 60 seconds
    }),
    IngestionModule, 
    DatabaseModule, 
    NormalizationModule, 
    RoutingModule, 
    DeliveryModule, 
    ReviewModule, 
    SLMModule, 
    AccumulatorModule, MetricsModule, 
    // JobsModule
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard }
  ],
  
})
export class AppModule {}
