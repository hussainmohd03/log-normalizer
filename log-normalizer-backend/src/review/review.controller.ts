import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ReviewService } from './review.service';
import { CorrectionDTO } from './dto/correction.dto';
import { ApiGuard } from 'src/common/guards/api-key.guard';

@UseGuards(ApiGuard)
@Controller('review')
export class ReviewController {
  constructor(private reviewService: ReviewService){}
  
  
  @Get('pending')
  getPending(@Query('limit') limit?: string) {
    return this.reviewService.getPending(limit ? parseInt(limit) : 20);
  }

  @Post(':id/correct')
  async correct(@Param('id') reviewId: string, @Body() dto: CorrectionDTO) {
    return await this.reviewService.submitCorrection(reviewId, dto.correctedOcsf, dto.reviewer)
  }
}
