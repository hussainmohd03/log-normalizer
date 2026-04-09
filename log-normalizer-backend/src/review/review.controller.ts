import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from 'src/auth/auth.types';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CorrectionDTO } from './dto/correction.dto';
import { ReviewService } from './review.service';

@UseGuards(JwtAuthGuard)
@Controller('review')
export class ReviewController {
  constructor(private reviewService: ReviewService) {}

  @Get('pending')
  async getPending(@Query('limit') limit?: string) {
    return this.reviewService.getPending(limit ? parseInt(limit) : 20);
  }

  @Post(':id/correct')
  async correct(
    @Param('id') reviewId: string,
    @Body() dto: CorrectionDTO,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ) {
    // JwtAuthGuard guarantees this, but be explicit — never let an
    // API-key principal post a correction even via a future code path
    // that loosens the guard.
    if (principal.kind !== 'user') {
      throw new ForbiddenException('Corrections require a user account');
    }
    return this.reviewService.submitCorrection(reviewId, dto.correctedOcsf, principal.email);
  }
}
