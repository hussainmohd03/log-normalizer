import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { NormalizationModule } from 'src/normalization/normalization.module';

@Module({
  imports: [NormalizationModule],
  controllers: [IngestionController],
  providers: [IngestionService],
})
export class IngestionModule {}
