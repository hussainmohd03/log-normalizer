import type {
  MetricsOverview,
  TimelinePoint,
  SourceMetric,
  DecisionMetric,
  ReviewQueueInfo,
  PendingReview,
  CorrectionPayload,
  HealthStatus,
} from '../types'

/* -- Config -- */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
const API_KEY  = import.meta.env.VITE_API_KEY || ''

/* -- Base fetch wrapper -- */

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const api = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, body || res.statusText)
  }

  return res.json()
}

/* -- Typed endpoints -- */

export const endpoints = {
  // Metrics
  overview:     ()          => api<MetricsOverview>('/metrics/overview'),
  timeline:     (days = 7)  => api<TimelinePoint[]>(`/metrics/timeline?days=${days}`),
  bySource:     ()          => api<SourceMetric[]>('/metrics/by-source'),
  byDecision:   ()          => api<DecisionMetric[]>('/metrics/by-decision'),
  reviewQueue:  ()          => api<ReviewQueueInfo>('/metrics/review-queue'),

  // Review
  pending:      ()          => api<PendingReview[]>('/review/pending'),
  submitCorrection: (id: string, payload: CorrectionPayload) =>
    api(`/review/${id}/correct`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Health
  health:       ()          => api<HealthStatus>('/health'),
}
