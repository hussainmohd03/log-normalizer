import { Body, Controller, Headers, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiKeyAuthGuard } from "src/auth/guards/api-key-auth.guard";
import { IngestBatchDto, IngestDto } from "./dto/ingest-log.dto";
import { IngestionService } from "./ingestion.service";

@Controller('logs')
@UseGuards(ApiKeyAuthGuard)
export class IngestionController {
  constructor(private ingestionService: IngestionService) {}

  @Post('ingest')
  @HttpCode(HttpStatus.ACCEPTED)
  async receiveAlert(
    @Body() dto: IngestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const { jobId, status } = await this.ingestionService.receiveAlert(dto, idempotencyKey);
    // Always return 202 — even on dedup. The envelope shape is identical
    // to a fresh create so the client code path stays simple.
    return { jobId, status };
  }

  @Post('ingest/batch')
  @HttpCode(HttpStatus.ACCEPTED)
  async receiveBatch(@Body() dto: IngestBatchDto) {
    const { results, count } = await this.ingestionService.receiveBatch(dto);
    return {
      count,
      status: 'queued',
      jobIds: results.map((r) => r.jobId),
    };
  }
}