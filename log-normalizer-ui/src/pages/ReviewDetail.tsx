import { useState } from 'react'
import { endpoints } from '../api/client'
import JsonViewer from '../components/JsonViewer'
import { extractAlertTitle } from '../utils/ocsf'
import { timeAgo } from '../utils/time'
import type { PendingReview } from '../types'

interface ReviewDetailProps {
  review: PendingReview
  onBack: () => void
}

const confColor = (val: number): string => {
  if (val < 0.6)  return 'var(--red)'
  if (val < 0.85) return 'var(--amber)'
  return 'var(--green)'
}

const ReviewDetail = ({ review, onBack }: ReviewDetailProps) => {
  const [ocsf, setOcsf]           = useState(JSON.stringify(review.slmOcsfOutput, null, 2))
  const [reviewer, setReviewer]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [tab, setTab]             = useState<'model' | 'corrected'>('corrected')

  const color       = confColor(review.confidence)
  const breakdown   = review.confidenceBreakdown
  const errors      = review.validationErrors ?? []
  const priorityBadge = review.priority === 'HIGH' ? 'red' : 'amber'

  const handleSubmit = async () => {
    if (!reviewer.trim()) {
      setError('Reviewer name is required')
      return
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(ocsf)
    } catch {
      setError('Invalid JSON — check your edits')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await endpoints.submitCorrection(review.id, {
        correctedOcsf: parsed,
        reviewedBy: reviewer,
      })
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fade-in">
      <button className="back-link" onClick={onBack}>← Back to queue</button>

      <div className="page-header">
        <h1 className="page-title">
          {review.source}: {extractAlertTitle(review.slmOcsfOutput)}
        </h1>
        <span className={`badge badge--${priorityBadge}`}>{review.priority}</span>
      </div>

      <div className="detail-meta">
        <span>Source: {review.source}</span>
        <span>ID: {review.id.slice(0, 8)}</span>
        <span>Queued: {timeAgo(review.queuedAt)}</span>
      </div>

      {/* -- Confidence -- */}
      <div className="card card--tight mb-12">
        <div className="confidence-bar">
          <span className="confidence-label">Confidence</span>
          <div className="confidence-track">
            <div
              className="confidence-fill"
              style={{ width: `${review.confidence * 100}%`, background: color }}
            />
          </div>
          <span className="confidence-value" style={{ color }}>{review.confidence.toFixed(2)}</span>
        </div>
        {breakdown && (
          <div className="confidence-breakdown">
            <span>Schema: {breakdown.schema_validity.toFixed(2)}</span>
            <span>Coverage: {breakdown.field_coverage.toFixed(2)}</span>
            <span>Consistency: {breakdown.value_consistency.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* -- Validation errors -- */}
      {errors.length > 0 && (
        <div className="errors-box">
          <div className="errors-title">Validation errors</div>
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}

      {/* -- Split panels -- */}
      <div className="split-panels">
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Raw alert (input)</span>
            <span className="panel-hint">Read only</span>
          </div>
          <JsonViewer data={review.rawLog.rawContent} maxHeight={340} />
        </div>

        <div className="panel">
          <div className="panel-header">
            <div className="tabs">
              <button
                className={`tab ${tab === 'model' ? 'tab--active' : ''}`}
                onClick={() => setTab('model')}
              >
                Model output
              </button>
              <button
                className={`tab ${tab === 'corrected' ? 'tab--active' : ''}`}
                onClick={() => setTab('corrected')}
              >
                Corrected OCSF
              </button>
            </div>
          </div>
          {tab === 'model' ? (
            <JsonViewer data={review.slmOcsfOutput} maxHeight={340} />
          ) : (
            <textarea
              className="json-editor"
              value={ocsf}
              onChange={(e) => setOcsf(e.target.value)}
              spellCheck={false}
            />
          )}
        </div>
      </div>

      {/* -- Error -- */}
      {error && <div className="submit-error">{error}</div>}

      {/* -- Action bar -- */}
      <div className="action-bar">
        <div className="action-bar-left">
          <span>Reviewer:</span>
          <input
            className="input"
            type="text"
            placeholder="Your name"
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
          />
        </div>
        <div className="action-bar-right">
          <button className="btn btn--ghost" onClick={onBack}>Skip</button>
          <button
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit correction'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ReviewDetail
