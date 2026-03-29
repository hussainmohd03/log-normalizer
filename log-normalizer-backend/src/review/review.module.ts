import { Module } from '@nestjs/common';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';
import { DeliveryModule } from 'src/delivery/delivery.module';

@Module({
  imports: [DeliveryModule],
  providers: [ReviewService],
  controllers: [ReviewController],
  exports: [ReviewService]
})
export class ReviewModule {}
