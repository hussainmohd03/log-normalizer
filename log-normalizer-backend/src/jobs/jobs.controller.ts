import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { JobListFiltersDto } from './dto/job-list-filters.dto';
import { JobsService } from './jobs.service';

@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  async list(@Query() filters: JobListFiltersDto) {
    return this.jobsService.list(filters);
  }
}
