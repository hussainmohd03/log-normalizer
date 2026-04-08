import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiGuard } from 'src/common/guards/api-key.guard';
import { JobResponse, toJobResponse } from './dto/job-response.dto';
import { JobsService } from './jobs.service';

/**
 * Read-side controller for NormalizeJob rows.
 *
 * Mounted under `normalize/jobs` so the public surface stays grouped
 * under the normalize feature, while the implementation lives in
 * JobsModule (which owns the row).
 *
 * Step 6 ships the polling endpoint. Step 9 will add the SSE endpoint
 * (`GET /:id/events`) on this same controller.
 */
@Controller('normalize/jobs')
@UseGuards(ApiGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get(':id')
  async findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<JobResponse> {
    const row = await this.jobsService.findById(id);
    if (!row) {
      throw new NotFoundException(`Job ${id} not found`);
    }
    return toJobResponse(row);
  }
}
