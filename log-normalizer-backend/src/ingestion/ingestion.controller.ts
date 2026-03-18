import { Body, Controller, HttpCode, Post, HttpStatus, UseGuards  } from "@nestjs/common";
import { IngestionService } from "./ingestion.service";
import { IngestBatchDto, IngestDto } from "./dto/ingest-log.dto";
import { ApiGuard } from "src/common/guards/api-key.guard";

@Controller('logs')
@UseGuards(ApiGuard)
export class IngestionController {
  constructor (private ingestionService: IngestionService) {}
  
  @Post('ingest')
  @HttpCode(HttpStatus.ACCEPTED)
  async receiveAlert(@Body() dto: IngestDto) {
    return await this.ingestionService.receiveAlert(dto)
  }

  @Post('ingest/batch')
  @HttpCode(HttpStatus.ACCEPTED)
  async receiveBatch(@Body() dto: IngestBatchDto) {
    return await this.ingestionService.receiveBatch(dto)
  }
}