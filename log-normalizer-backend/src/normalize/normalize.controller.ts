import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiGuard } from 'src/common/guards/api-key.guard';
import { NormalizeRequestDto } from './dto/normalize-request.dto';
import { NormalizeService } from './normalize.service';

@Controller('normalize')
@UseGuards(ApiGuard)
export class NormalizeController {
  constructor(private readonly normalizeService: NormalizeService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async enqueue(@Body() dto: NormalizeRequestDto) {
    const job = await this.normalizeService.create(dto);
    return { jobId: job.id, status: 'queued' };
  }
}
