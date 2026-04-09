import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@UseGuards(JwtAuthGuard)
export class MetricsController {

  constructor(private metricsService: MetricsService){}


  @Get('overview')
  async overview(){
    return await this.metricsService.overview()
  }

  @Get('timeline')
  async timeline(@Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number){
    return await this.metricsService.timeline(days)
  }

  @Get('by-source')
  async bySource(){
    return await this.metricsService.bySource()
  }
  @Get('by-decision')
  async byDecision(){
    return await this.metricsService.byDecision()
  }
  @Get('review-queue')
  async reviewQueue(){
    return await this.metricsService.reviewQueue()
  }

  
}
