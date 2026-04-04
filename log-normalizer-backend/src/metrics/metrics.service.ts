import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'

@Injectable()
export class MetricsService {

  constructor(private prisma: PrismaService){}

  async overview() {
    const [metrics, successCount] = await Promise.all([
      this.prisma.processingMetric.aggregate({
        _count: { id: true },
        _avg: { latencyMs: true, confidence: true },
      }),
      this.prisma.processingMetric.count({ where: { success: true } }),
    ])

    const total = metrics._count.id

    return {
      totalLogs: total,
      avgConfidence: metrics._avg.confidence ?? 0,
      avgLatencyMs: metrics._avg.latencyMs ?? 0,
      successRate: total > 0 ? (successCount / total) * 100 : 0,
      reviewRate: total > 0
        ? ((total - successCount) / total) * 100
        : 0,
    }
  }

  async bySource() {
    const raw = await this.prisma.processingMetric.groupBy({
      by: ['source'],
      _count: { id: true },
      _avg: { confidence: true, latencyMs: true },
    })

    return raw.map((r) => ({
      source: r.source,
      count: r._count.id,
      avgConfidence: r._avg.confidence ?? 0,
      avgLatencyMs: r._avg.latencyMs ?? 0,
    }))
  }

  async byDecision() {
    const raw = await this.prisma.processingMetric.groupBy({
      by: ['decision'],
      _count: { id: true },
    })

    const total = raw.reduce((sum, r) => sum + r._count.id, 0)

    return raw.map((r) => ({
      decision: r.decision,
      count: r._count.id,
      percentage: total > 0 ? (r._count.id / total) * 100 : 0,
    }))
  }

  async timeline(days: number) {
    const rows = await this.prisma.$queryRaw`
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

    return (rows as any[]).map((r) => ({
      timestamp: r.bucket,
      count: r.count,
      avgConfidence: r.avg_confidence ?? 0,
      avgLatencyMs: r.avg_latency ?? 0,
    }))
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
    ])

    return {
      pendingCount: count,
      oldestQueuedAt: oldest?.queuedAt || null,
      oldestMinutes: oldest
        ? Math.floor((Date.now() - oldest.queuedAt.getTime()) / 60_000)
        : 0,
    }
  }
}
