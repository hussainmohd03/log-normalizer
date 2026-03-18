import { Module } from '@nestjs/common';
import { IngestionModule } from './ingestion/ingestion.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true}),
    IngestionModule, 
    DatabaseModule
  ],
  controllers: [HealthController],

  
})
export class AppModule {}
