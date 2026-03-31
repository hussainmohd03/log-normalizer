import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { ApiGuard } from 'src/common/guards/api-key.guard';

@Controller('metrics')
@UseGuards(ApiGuard)
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
