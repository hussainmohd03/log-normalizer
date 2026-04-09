/* -- Navigation -- */

export type Page = 'dashboard' | 'review' | 'metrics' | 'health'

/* -- Auth -- */

export type UserRole = 'ANALYST' | 'ADMIN'

export interface AuthUser {
  email: string
  role: UserRole
}

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
  normalizeJobId: string
  source: string
  confidence: number
  confidenceBreakdown: ConfidenceBreakdown | null
  validationErrors: string[] | null
  priority: 'NORMAL' | 'HIGH'
  slmOcsfOutput: Record<string, unknown>
  queuedAt: string
  /**
   * Joined NormalizeJob row (set by ReviewService.getPending). The
   * `rawLog` field on the join is now a JSON value, not a wrapper
   * object — schema unification removed the old RawLog table.
   */
  normalizeJob: {
    id: string
    rawLog: Record<string, unknown>
    source: string
  }
}

export interface CorrectionPayload {
  /** reviewedBy is sourced from the JWT — never sent from the client. */
  correctedOcsf: Record<string, unknown>
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