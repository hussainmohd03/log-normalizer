import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/database/prisma.service';



@Injectable()
export class CleanUpJob {
  private readonly logger = new Logger(CleanUpJob.name)
  private readonly capPerVendor: number;

  constructor(private prisma: PrismaService, private config: ConfigService) {
    this.capPerVendor = this.config.get('ACCUMULATOR_CAP_PER_VENDOR') || 10_000
  }


  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanup(){

    const vendors = await this.prisma.accumulatedPair.groupBy({
      by: ['source'],
      _count: { id: true }
    })

    for (const vendor of vendors) {
      const count = vendor._count.id
      if (count <= this.capPerVendor) continue

      const excess = count - this.capPerVendor

      await this.prisma.$executeRaw`
      DELETE FROM "AccumulatedPair"
      WHERE id IN (
        SELECT id FROM "AccumulatedPair"
        WHERE source = ${vendor.source}
        ORDER BY "accumulatedAt" ASC
        LIMIT ${excess}
      )
      `
      this.logger.log(`${vendor.source}: deleted ${excess} pairs (capped at ${this.capPerVendor})`)
    }


  }
}