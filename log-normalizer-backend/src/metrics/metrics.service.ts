import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class MetricsService {

  constructor(private prisma: PrismaService){}

  async overview(){

    const [metrics, successCount] = await Promise.all([
        this.prisma.processingMetric.aggregate({
          _count: { id: true },
          _avg: {
            latencyMs: true,
            confidence: true,
          },
        }),

        this.prisma.processingMetric.count({
          where: { success: true },
        }),
      ]);

      const total = metrics._count.id;

      return {
        totalLogs: total, 
        avgConfidence: metrics._avg.confidence,
        avgLatency: metrics._avg.latencyMs,
        avgSuccess: total > 0 ? successCount / total : 0,
      }
  }

  async timeline(days: number) {
    return await this.prisma.$queryRaw`
      SELECT 
        date_trunc('hour', timestamp) as bucket,
        COUNT(*)::int as count,
        AVG(confidence)::float as avg_confidence,
        AVG("latencyMs")::int as avg_latency
      FROM "ProcessingMetric"
      WHERE timestamp > NOW() - ${days}::int * INTERVAL '1 day'
      GROUP BY bucket
      ORDER BY bucket ASC
      `
  }

  async bySource(){
    
    const vendorMetrics = await this.prisma.processingMetric.groupBy({
      by: ['source'],
      _count: { id: true },
      _avg: {
        confidence: true,
        latencyMs: true
      }
    })

    return vendorMetrics
  }

  async byDecision(){
    
    const decisionMetrics = await this.prisma.processingMetric.groupBy({
      by: ['decision'],
      _count: { id: true }
    })

    return decisionMetrics
  }

  async reviewQueue() {
    const [count, oldest] = await Promise.all([
      this.prisma.manualReview.count({
        where: { reviewedAt: null },
      }),

      this.prisma.manualReview.findFirst({
        where: { reviewedAt: null },
        orderBy: { queuedAt: 'asc' },
        select: { queuedAt: true },
      }),
    ]);

    return {
      pendingCount: count,
      oldestQueuedAt: oldest?.queuedAt || null,
      oldestAgeMinutes: oldest
        ? Math.floor((Date.now() - oldest.queuedAt.getTime()) / 60_000)
        : 0,
    };
}
}
