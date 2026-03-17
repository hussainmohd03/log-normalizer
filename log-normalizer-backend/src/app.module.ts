import { Module } from '@nestjs/common';
import { IngestionModule } from './ingestion/ingestion.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true}),
    IngestionModule, 
    DatabaseModule
  ],

  
})
export class AppModule {}
