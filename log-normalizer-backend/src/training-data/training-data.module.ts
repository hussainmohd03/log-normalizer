import { Module } from '@nestjs/common';
import { TrainingDataController } from './training-data.controller';
import { TrainingDataService } from './training-data.service';

@Module({
  controllers: [TrainingDataController],
  providers: [TrainingDataService],
  exports: [TrainingDataService],
})
export class TrainingDataModule {}
