import { useState, useCallback, useEffect } from 'react'
import { endpoints, ApiError } from '../api/client'
import { timeAgo } from '../utils/time'
import type { JobSummary, JobListFilters } from '../types'

const STATUS_OPTIONS = ['QUEUED', 'ACTIVE', 'COMPLETED', 'FAILED'] as const
const DECISION_OPTIONS = ['accept', 'review', 'reject'] as const
const PAGE_SIZE = 25

const statusColor = (status: string) => {
  switch (status) {
    case 'COMPLETED': return 'green'
    case 'FAILED':    return 'red'
    case 'ACTIVE':    return 'amber'
    default:          return 'slate'
  }
}

const decisionColor = (decision: string | null) => {
  switch (decision) {
    case 'accept': return 'green'
    case 'review': return 'amber'
    case 'reject': return 'red'
    default:       return 'slate'
  }
}

interface JobsProps {
  onOpenReview?: (reviewJobId: string) => void
}

const Jobs = ({ onOpenReview }: JobsProps) => {
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flagError, setFlagError] = useState<string | null>(null)
  const [flaggingId, setFlaggingId] = useState<string | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [decisionFilter, setDecisionFilter] = useState<string[]>([])
  const [sourceFilter, setSourceFilter] = useState('')
  const [page, setPage] = useState(1)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const filters: JobListFilters = {
        page,
        pageSize: PAGE_SIZE,
      }
      if (statusFilter.length) filters.status = statusFilter
      if (decisionFilter.length) filters.decision = decisionFilter
      if (sourceFilter.trim()) filters.source = [sourceFilter.trim()]

      const result = await endpoints.jobs.list(filters)
      setJobs(result.jobs)
      setTotal(result.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, decisionFilter, sourceFilter])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const handleFlag = async (jobId: string) => {
    if (!confirm('Flag this job for review? It will appear in the review queue.')) return

    setFlaggingId(jobId)
    setFlagError(null)
    try {
      await endpoints.jobs.flagForReview(jobId)
      await fetchJobs()
    } catch (err) {
      setFlagError(
        err instanceof ApiError
          ? `Could not flag job: ${err.message}`
          : 'Could not flag job',
      )
    } finally {
      setFlaggingId(null)
    }
  }

  const toggleFilter = (current: string[], value: string, setter: (v: string[]) => void) => {
    setter(
      current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value],
    )
    setPage(1)
  }

  const clearFilters = () => {
    setStatusFilter([])
    setDecisionFilter([])
    setSourceFilter('')
    setPage(1)
  }

  const hasFilters = statusFilter.length > 0 || decisionFilter.length > 0 || sourceFilter.trim() !== ''
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const showFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showTo = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Jobs</h1>
          <span className="page-sub">Browse all normalization jobs and flag any that need correction.</span>
        </div>
      </div>

      {/* Filters */}
      <div className="card card--tight mb-12">
        <div className="jobs-filters">
          <div className="jobs-filter-group">
            <label className="jobs-filter-label">Status</label>
            <div className="filter-row">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s}
                  className={`btn btn--filter ${statusFilter.includes(s) ? 'btn--filter-active' : ''}`}
                  onClick={() => toggleFilter(statusFilter, s, setStatusFilter)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="jobs-filter-group">
            <label className="jobs-filter-label">Decision</label>
            <div className="filter-row">
              {DECISION_OPTIONS.map(d => (
                <button
                  key={d}
                  className={`btn btn--filter ${decisionFilter.includes(d) ? 'btn--filter-active' : ''}`}
                  onClick={() => toggleFilter(decisionFilter, d, setDecisionFilter)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="jobs-filter-group">
            <label className="jobs-filter-label">Source</label>
            <input
              type="text"
              className="jobs-source-input"
              placeholder="e.g. crowdstrike"
              value={sourceFilter}
              onChange={e => { setSourceFilter(e.target.value); setPage(1) }}
            />
          </div>

          {hasFilters && (
            <button className="btn btn--ghost btn--sm" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Error states */}
      {error && (
        <div className="errors-box mb-12">
          <div className="errors-title">Error</div>
          <div>{error}</div>
          <button className="btn btn--sm" onClick={fetchJobs} style={{ marginTop: 8 }}>Retry</button>
        </div>
      )}

      {flagError && (
        <div className="errors-box mb-12">
          <div>{flagError}</div>
        </div>
      )}

      {/* Table */}
      <div className="card">
        {loading && jobs.length === 0 ? (
          <div className="skeleton-table">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton-row" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="empty">
            No jobs match your filters.
            {hasFilters && (
              <button className="btn btn--ghost btn--sm" onClick={clearFilters} style={{ marginLeft: 8 }}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <table className="jobs-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Decision</th>
                  <th>Confidence</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id} className="jobs-row">
                    <td className="jobs-id">{job.id.slice(0, 8)}</td>
                    <td>{job.source}</td>
                    <td>
                      <span className={`badge badge--${statusColor(job.status)}`}>
                        {job.status}
                      </span>
                    </td>
                    <td>
                      {job.decision && (
                        <span className={`badge badge--${decisionColor(job.decision)}`}>
                          {job.decision}
                        </span>
                      )}
                    </td>
                    <td>{job.confidence !== null ? job.confidence.toFixed(2) : '—'}</td>
                    <td>{timeAgo(job.createdAt)}</td>
                    <td className="jobs-action-cell">
                      {job.status === 'COMPLETED' && job.hasManualReview && (
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => onOpenReview?.(job.id)}
                        >
                          Open review
                        </button>
                      )}
                      {job.status === 'COMPLETED' && !job.hasManualReview && (
                        <button
                          className="btn btn--primary btn--sm"
                          onClick={() => handleFlag(job.id)}
                          disabled={flaggingId === job.id}
                        >
                          {flaggingId === job.id ? 'Flagging...' : 'Flag for review'}
                        </button>
                      )}
                      {job.wasSuperseded && (
                        <span className="badge badge--slate" style={{ marginLeft: 4 }}>corrected</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="jobs-pagination">
              <span className="jobs-pagination-info">
                Showing {showFrom}–{showTo} of {total}
              </span>
              <div className="jobs-pagination-buttons">
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page <= 1}
                >
                  Prev
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                  const pageNum = i + 1
                  return (
                    <button
                      key={pageNum}
                      className={`btn btn--sm ${page === pageNum ? 'btn--primary' : 'btn--ghost'}`}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  )
                })}
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Jobs
