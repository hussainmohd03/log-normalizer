import { Module } from '@nestjs/common';
import { RoutingService } from './routing.service';
import { AccumulatorModule } from 'src/accumulator/accumulator.module';
import { DeliveryModule } from 'src/delivery/delivery.module';
import { ReviewModule } from 'src/review/review.module';

@Module({
  imports: [
    AccumulatorModule,
    DeliveryModule,
    ReviewModule
  ],
  providers: [RoutingService],
  exports: [RoutingService]
})
export class RoutingModule {}
