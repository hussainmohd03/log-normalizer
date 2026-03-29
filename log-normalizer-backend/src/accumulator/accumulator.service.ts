import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccumulatedPairCreateManyInput } from 'generated/prisma/models';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class AccumulatorService implements OnModuleInit, OnModuleDestroy{
  private pairs: AccumulatedPairCreateManyInput[] = [];
  private flushInterval: NodeJS.Timeout;
  private readonly logger = new Logger(AccumulatorService.name);
  private readonly flushSize: number;
  private readonly maxBuffer: number;
  private readonly intervalMs: number;

  constructor(private prisma: PrismaService, private config: ConfigService) {
    this.flushSize = this.config.get('ACCUMULATOR_FLUSH_SIZE') || 100;
    this.maxBuffer = this.config.get('ACCUMULATOR_MAX_BUFFER') || 1000;
    this.intervalMs = this.config.get('ACCUMULATOR_FLUSH_INTERVAL_MS') || 5000;
  }
  
  onModuleInit() {
    this.flushInterval = setInterval(() => {
      if (this.pairs.length > 0) {
        this.flush().catch(err =>
          this.logger.error(`Scheduled flush failed: ${err.message}`),
        );
      }
    }, this.intervalMs);
  }

  async onModuleDestroy() {
    clearInterval(this.flushInterval);
    if (this.pairs.length > 0) {
      this.logger.log(`Shutdown: flushing ${this.pairs.length} remaining pairs`);
      await this.flush();
    }
  }

  buffer(
    source: string,
    rawContent: Record<string, any>,
    ocsfOutput: Record<string, any>,
    confidence: number,
  ): void {
    if (this.pairs.length >= this.maxBuffer) {
      this.logger.warn(`Buffer full (${this.maxBuffer}) - dropping pair`);
      return;
    }

    this.pairs.push({ source, rawContent, ocsfOutput, confidence });

    if (this.pairs.length >= this.flushSize) {
      this.flush().catch(err =>
        this.logger.error(`Size-triggered flush failed: ${err.message}`),
      );
    }
  }

  async flush(): Promise<void> {
    if (this.pairs.length === 0) return;

    const toWrite = this.pairs.splice(0, this.pairs.length);

    try {
      await this.prisma.accumulatedPair.createMany({
        data: toWrite,
      });
      this.logger.log(`Flushed ${toWrite.length} pairs`);
    } catch (error) {
      
      // Put them back on failure - don't lose data
      this.pairs.unshift(...toWrite);
      throw error;
    }
  }

  
}
