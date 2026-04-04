import { useState } from 'react'
import { endpoints } from '../api/client'
import { useApi } from '../api/useApi'
import { extractAlertTitle } from '../utils/ocsf'
import { timeAgo } from '../utils/time'
import ReviewDetail from './ReviewDetail'
import type { PendingReview } from '../types'

type Filter = 'all' | 'HIGH' | 'NORMAL'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all',    label: 'All' },
  { id: 'HIGH',   label: 'High priority' },
  { id: 'NORMAL', label: 'Normal' },
]

const ReviewQueue = () => {
  const { data: reviews, refetch } = useApi(() => endpoints.pending(), [])
  const [filter, setFilter]        = useState<Filter>('all')
  const [selected, setSelected]    = useState<PendingReview | null>(null)

  const filtered = (reviews ?? []).filter(
    (r) => filter === 'all' || r.priority === filter,
  )

  const handleBack = () => {
    setSelected(null)
    refetch()
  }

  if (selected) {
    return <ReviewDetail review={selected} onBack={handleBack} />
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Review queue</h1>
          <span className="page-sub">{filtered.length} pending</span>
        </div>
      </div>

      <div className="filter-row">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            className={`btn btn--filter ${filter === id ? 'btn--filter-active' : ''}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card">
        {filtered.length === 0 && <div className="empty">No pending reviews</div>}

        {filtered.map((review) => (
          <div key={review.id} className="review-item">
            <div>
              <div className="review-title">
                {review.source}: {extractAlertTitle(review.slmOcsfOutput)}
              </div>
              <div className="review-meta">
                Confidence: {review.confidence.toFixed(2)} · {timeAgo(review.queuedAt)}
              </div>
            </div>
            <div className="review-actions">
              <span className={`badge badge--${review.priority === 'HIGH' ? 'red' : 'amber'}`}>
                {review.priority}
              </span>
              <button className="btn" onClick={() => setSelected(review)}>
                Review
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ReviewQueue
