/* -- Navigation -- */

export type Page = 'dashboard' | 'review' | 'metrics' | 'health'

/* -- Metrics -- */
export interface SystemMetrics {
  memory_used_mb: number
  memory_total_mb: number
  memory_percent: number
  cpu_percent?: number       
  cpu_load_avg_1m?: number   
  cpu_cores: number
  uptime_seconds: number
  gpu_memory_used_mb?: number
  gpu_memory_total_mb?: number
  gpu_memory_percent?: number
  gpu_utilization_percent?: number | null
}

export interface MetricsOverview {
  totalLogs: number
  avgConfidence: number
  avgLatencyMs: number
  successRate: number
  reviewRate: number
}

export interface TimelinePoint {
  timestamp: string
  count: number
  avgConfidence: number
  avgLatencyMs: number
}

export interface SourceMetric {
  source: string
  count: number
  avgConfidence: number
  avgLatencyMs: number
}

export interface DecisionMetric {
  decision: string
  count: number
  percentage: number
}

export interface ReviewQueueInfo {
  pendingCount: number
  oldestMinutes: number
}

/* -- Review -- */

export interface ConfidenceBreakdown {
  schema_validity: number
  field_coverage: number
  value_consistency: number
}

export interface PendingReview {
  id: string
  rawLogId: string
  source: string
  confidence: number
  confidenceBreakdown: ConfidenceBreakdown | null
  validationErrors: string[] | null
  priority: 'NORMAL' | 'HIGH'
  slmOcsfOutput: Record<string, unknown>
  queuedAt: string
  rawLog: {
    id: string
    rawContent: Record<string, unknown>
    source: string
  }
}

export interface CorrectionPayload {
  correctedOcsf: Record<string, unknown>
  reviewedBy: string
}

/* -- Health -- */
export interface SLMHealth {
  status: string
  model_loaded: boolean
  model_path: string
  system?: SystemMetrics
}

export interface HealthStatus {
  status: 'ok' | 'unhealthy'
  database: string
  circuit_breaker: string
  slm_service: string | SLMHealth
  system?: SystemMetrics
}