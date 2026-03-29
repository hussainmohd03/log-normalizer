import { Module } from '@nestjs/common';
import { AccumulatorService } from './accumulator.service';

@Module({
  providers: [AccumulatorService],
  exports: [AccumulatorService]
})
export class AccumulatorModule {}
