/* -- Navigation -- */

export type Page = 'dashboard' | 'review' | 'metrics' | 'health' | 'users' | 'training-data' | 'jobs'

/* -- Auth -- */

export type UserRole = 'ANALYST' | 'ADMIN'

export interface AuthUser {
  email: string
  role: UserRole
}

/* -- Users (admin management) -- */

export interface User {
  id: string
  email: string
  role: UserRole
  createdAt: string
  lastLoginAt: string | null
}

export interface CreateUserPayload {
  email: string
  password: string
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
  // Negative deduction applied by the post-processor (one per stripped
  // hallucination, capped at -0.30). Absent on reviews queued before the
  // post-processor shipped.
  post_process_penalty?: number
}

export interface PendingReview {
  id: string
  normalizeJobId: string
  source: string
  confidence: number
  confidenceBreakdown: ConfidenceBreakdown | null
  validationErrors: string[] | null
  priority: 'NORMAL' | 'HIGH'
  correctionType: CorrectionType
  slmOcsfOutput: Record<string, unknown>
  queuedAt: string
  reviewedAt: string | null
  reviewedBy: string | null
  flaggedBy: { email: string } | null
  /**
   * Joined NormalizeJob row (set by ReviewService.getPending). The
   * `rawLog` field on the join is now a JSON value, not a wrapper
   * object — schema unification removed the old RawLog table.
   */
  normalizeJob: {
    id: string
    rawLog: Record<string, unknown>
    source: string
    fixesApplied: string[] | null
    hallucinationsStripped: string[] | null
  }
}

/* -- Training data export -- */

export interface TrainingExportRecord {
  id: string
  exportedAt: string
  exportedByEmail: string
  recordCount: number
}

export interface TrainingDataStats {
  totalCorrections: number
  pendingExport: number
  alreadyExported: number
  lastExportAt: string | null
  exportHistory: TrainingExportRecord[]
}

export interface CorrectionPayload {
  /** reviewedBy is sourced from the JWT — never sent from the client. */
  correctedOcsf: Record<string, unknown>
}

/* -- Jobs browse -- */

export type CorrectionType = 'AUTO_FLAGGED' | 'HUMAN_FLAGGED'

export interface JobSummary {
  id: string
  source: string
  status: string
  decision: string | null
  confidence: number | null
  createdAt: string
  completedAt: string | null
  hasManualReview: boolean
  wasSuperseded: boolean
}

export interface JobListFilters {
  status?: string[]
  decision?: string[]
  source?: string[]
  createdAfter?: string
  createdBefore?: string
  hasReview?: boolean
  page?: number
  pageSize?: number
}

export interface JobListResponse {
  jobs: JobSummary[]
  total: number
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