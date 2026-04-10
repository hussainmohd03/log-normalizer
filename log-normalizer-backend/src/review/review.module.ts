import { Module } from '@nestjs/common';
import { ReviewService } from './review.service';
import { JobsFlagController, ReviewController } from './review.controller';
import { DeliveryModule } from 'src/delivery/delivery.module';

@Module({
  imports: [DeliveryModule],
  providers: [ReviewService],
  controllers: [ReviewController, JobsFlagController],
  exports: [ReviewService]
})
export class ReviewModule {}
