import { Injectable } from '@nestjs/common';
import { SLMClient } from './client/slm-client.service';
import { SLMResponse } from 'src/common/interfaces/slm-response.interface';
import { PrismaService } from 'src/database/prisma.service';
import { RawLog } from 'generated/prisma/browser';

@Injectable()
export class NormalizationService {

  constructor(private slmClient: SLMClient, private prisma: PrismaService){}

  async process(rawLog: RawLog): Promise<SLMResponse | null> {
      try {
    // Call Python via circuit breaker
    const response = await this.slmClient.normalize({
      raw_log: rawLog.rawContent as Record<string, any>,
      source: rawLog.source,
      format: rawLog.format,
    });

    // Update RawLog as success
    await this.prisma.rawLog.update({
      where: { id: rawLog.id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });

    return response;
  } catch (error) {
    // Update RawLog as failed
    await this.prisma.rawLog.update({
      where: { id: rawLog.id },
      data: { status: 'FAILED', errorMessage: error.message },
    });

    return null;
  }
  
  }
}
