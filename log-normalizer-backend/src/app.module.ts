import { Module } from '@nestjs/common';
import { IngestionModule } from './ingestion/ingestion.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { RoutingModule } from './routing/routing.module';
import { DeliveryModule } from './delivery/delivery.module';
import { ReviewModule } from './review/review.module';
import { SLMModule } from './slm/slm.module';
import { JobsModule } from './jobs/jobs.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TrainingDataModule } from './training-data/training-data.module';
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
    RoutingModule,
    DeliveryModule,
    ReviewModule,
    SLMModule,
    MetricsModule,
    JobsModule,
    ReconciliationModule,
    AuthModule,
    UsersModule,
    TrainingDataModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard }
  ],
  
})
export class AppModule {}
