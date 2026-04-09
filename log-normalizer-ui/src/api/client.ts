import type {
  AuthUser,
  CorrectionPayload,
  DecisionMetric,
  HealthStatus,
  MetricsOverview,
  PendingReview,
  ReviewQueueInfo,
  SourceMetric,
  TimelinePoint,
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

/**
 * 401 from a protected endpoint means the JWT cookie is missing or
 * expired. The auth context listens for this and clears its session
 * state, which sends the user back to the login screen.
 */
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
}
