import type {
  AuthUser,
  CorrectionPayload,
  CreateUserPayload,
  DecisionMetric,
  HealthStatus,
  JobListFilters,
  JobListResponse,
  MetricsOverview,
  PendingReview,
  ReviewQueueInfo,
  SourceMetric,
  TimelinePoint,
  TrainingDataStats,
  User,
} from '../types'

/* -- Config -- */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

/* -- Errors -- */

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}


export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message)
    this.name = 'UnauthorizedError'
  }
}

/* -- Base fetch wrapper -- */

const api = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    // credentials: include is REQUIRED for the httpOnly auth cookie to
    // ride along on every request. Without it the JWT is never sent.
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (res.status === 401) {
    throw new UnauthorizedError()
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, body || res.statusText)
  }

  // 204 No Content (used by /auth/logout) → nothing to parse
  if (res.status === 204) return undefined as T

  return res.json()
}

/* -- Typed endpoints -- */

export const endpoints = {
  // Auth
  login: (email: string, password: string) =>
    api<AuthUser>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  me: () => api<AuthUser>('/auth/me'),

  // Metrics
  overview:    ()         => api<MetricsOverview>('/metrics/overview'),
  timeline:    (days = 7) => api<TimelinePoint[]>(`/metrics/timeline?days=${days}`),
  bySource:    ()         => api<SourceMetric[]>('/metrics/by-source'),
  byDecision:  ()         => api<DecisionMetric[]>('/metrics/by-decision'),
  reviewQueue: ()         => api<ReviewQueueInfo>('/metrics/review-queue'),

  // Review
  pending: () => api<PendingReview[]>('/review/pending'),
  submitCorrection: (id: string, payload: CorrectionPayload) =>
    api(`/review/${id}/correct`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Health
  health: () => api<HealthStatus>('/health'),

  // Users (admin only)
  users: {
    list: () => api<User[]>('/users'),
    create: (payload: CreateUserPayload) =>
      api<User>('/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    delete: (id: string) =>
      api<void>(`/users/${id}`, { method: 'DELETE' }),
  },

  // Jobs browse
  jobs: {
    list: (filters: JobListFilters = {}) => {
      const params = new URLSearchParams()
      if (filters.status?.length) filters.status.forEach(s => params.append('status', s))
      if (filters.decision?.length) filters.decision.forEach(d => params.append('decision', d))
      if (filters.source?.length) filters.source.forEach(s => params.append('source', s))
      if (filters.createdAfter) params.set('createdAfter', filters.createdAfter)
      if (filters.createdBefore) params.set('createdBefore', filters.createdBefore)
      if (filters.hasReview !== undefined) params.set('hasReview', String(filters.hasReview))
      if (filters.page) params.set('page', String(filters.page))
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize))
      const qs = params.toString()
      return api<JobListResponse>(`/jobs${qs ? `?${qs}` : ''}`)
    },
    flagForReview: (id: string, reason?: string) =>
      api<{ id: string }>(`/jobs/${id}/flag-for-review`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
  },

  // Training data export (admin only)
  trainingData: {
    stats: () => api<TrainingDataStats>('/admin/training-data/stats'),
    // Returns the raw Response so the caller can read headers
    // (Content-Disposition / X-Record-Count) and stream the body into a
    // downloadable Blob. Bypasses the JSON-parsing wrapper on purpose —
    // the response is NDJSON, not JSON.
    export: async (): Promise<Response> => {
      const res = await fetch(`${BASE_URL}/admin/training-data/export`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.status === 401) throw new UnauthorizedError()
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new ApiError(res.status, body || res.statusText)
      }
      return res
    },
  },
}
