import { Module } from '@nestjs/common';
import { IngestionModule } from './ingestion/ingestion.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { ApiGuard } from './common/guards/api-key.guard';
import { NormalizationModule } from './normalization/normalization.module';
import { RoutingModule } from './routing/routing.module';
import { DeliveryModule } from './delivery/delivery.module';
import { ReviewModule } from './review/review.module';
import { SLMModule } from './slm/slm.module';
import { AccumulatorModule } from './accumulator/accumulator.module';
import { JobsModule } from './jobs/jobs.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({isGlobal: true}),
    IngestionModule, 
    DatabaseModule, 
    NormalizationModule, 
    RoutingModule, 
    DeliveryModule, 
    ReviewModule, 
    SLMModule, 
    AccumulatorModule, 
    // JobsModule
  ],
  controllers: [HealthController],
  providers: [ApiGuard]
  
})
export class AppModule {}
