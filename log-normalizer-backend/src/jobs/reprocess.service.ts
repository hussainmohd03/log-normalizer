import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { STATUS } from 'generated/prisma/enums';
import { PrismaService } from 'src/database/prisma.service';
import { NormalizationService } from 'src/normalization/normalization.service';
import { SLMService } from 'src/slm/slm.service';

@Injectable()
export class ReprocessJob {
  private batchSize: number;
  private running: boolean = false;
  private readonly logger = new Logger(ReprocessJob.name)


  constructor(
    private prisma: PrismaService, 
    private SLMClient: SLMService, 
    private normalizationService: NormalizationService, 
    private config: ConfigService) {
      
      this.batchSize = parseInt(this.config.get("PENDING_BATCH_SIZE")!) || 10 

    }


    @Cron(CronExpression.EVERY_5_MINUTES)
    async reprocessPending() {
      try {

        if(this.running) return
        this.running = true

        const pendingLogs = await this.prisma.rawLog.findMany({
          where: {
            OR: [
              { status: STATUS.PENDING },
              {
                status: STATUS.IN_PROGRESS,
                receivedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },  // stuck >10 min
              },
            ],
          },
          take: this.batchSize,
          orderBy: { receivedAt: 'asc' },
        })
  
        if(pendingLogs.length === 0 ) return 

        await this.prisma.rawLog.updateMany({
          where: { id: { in: pendingLogs.map(log => log.id) } },
          data: { status: STATUS.IN_PROGRESS }
        })

        for (const log of pendingLogs) {
          if(!this.SLMClient.isHealthy()){
            const remaining = pendingLogs.slice(pendingLogs.indexOf(log))
            await this.prisma.rawLog.updateMany({
              where: { id: { in: remaining.map(log => log.id) } },
              data: { status: STATUS.PENDING }
            })

            this.logger.warn('Circuit opened - returned remaining logs to PENDING')
            break
          }

          await this.normalizationService.process(log)
        }

      } catch (error) {
        this.logger.error(`Reprocess job failed: ${error.message}`)
      }finally{
        this.running = false
      }
    }
}
