import { Injectable, Logger } from '@nestjs/common';
import { IngestBatchDto, IngestDto } from './dto/ingest-log.dto';
import { PrismaService } from 'src/database/prisma.service';
import { NormalizationService } from 'src/normalization/normalization.service';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger('IngestionService');

  constructor(
    private prisma: PrismaService,
    private normalizationService: NormalizationService,
  ) {}

  async receiveAlert(dto: IngestDto) {
    const rawLog = await this.prisma.rawLog.create({
      data: {
        source: dto.source,
        rawContent: dto.rawContent,
      },
    });

    // Fire normalization in background
    this.normalizationService.process(rawLog).catch((err) => {
      this.logger.error(
        `[${rawLog.id}] Background normalization failed: ${err.message}`,
      );
    });

    return { id: rawLog.id, status: 'accepted' };
  }

  async receiveBatch(dto: IngestBatchDto) {
    const rawLogs = [];

    for (const alert of dto.alerts) {
      const rawLog = await this.prisma.rawLog.create({
        data: {
          source: dto.source,
          rawContent: alert,
        },
      });
      rawLogs.push(rawLog);
    }

    // Fire all normalizations in background
    for (const rawLog of rawLogs) {
      this.normalizationService.process(rawLog).catch((err) => {
        this.logger.error(
          `[${rawLog.id}] Background normalization failed: ${err.message}`,
        );
      });
    }

    return { count: rawLogs.length, status: 'accepted' };
  }
}
