import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ApiGuard } from 'src/common/guards/api-key.guard';
import { JobResponse, toJobResponse } from './dto/job-response.dto';
import { JobRetryService } from './job-retry.service';
import { JobsEventsService } from './jobs-events.service';
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
  constructor(
    private readonly jobsService: JobsService,
    private readonly jobsEventsService: JobsEventsService,
    private readonly jobRetryService: JobRetryService,
  ) {}

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

  /**
   * Server-Sent Events stream of job state. Emits the current DB row
   * immediately, then one event per state transition, then completes
   * when the job reaches COMPLETED or FAILED.
   *
   * Lifecycle:
   *  - Late connect (already terminal): one event, immediate close.
   *  - Mid-stream client disconnect: Nest unsubscribes the observable;
   *    the per-client filter pipeline tears down. The shared QueueEvents
   *    subscription stays alive for other clients.
   *  - Row missing at connect: NotFoundException → 404 before SSE opens.
   */
  @Sse(':id/events')
  events(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Observable<MessageEvent> {
    return this.jobsEventsService.streamJob(id);
  }

  /**
   * Retries a FAILED job. Creates a NEW NormalizeJob row with a NEW UUID
   * and a parentJobId reference to the source. Returns 202 with the new
   * job envelope. 409 on any non-FAILED source state, 404 if the source
   * does not exist.
   */
  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<{ jobId: string; status: 'queued'; parentJobId: string }> {
    const child = await this.jobRetryService.retry(id);
    return { jobId: child.id, status: 'queued', parentJobId: id };
  }
}
