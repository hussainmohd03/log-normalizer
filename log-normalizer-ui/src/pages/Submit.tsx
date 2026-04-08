import { useState } from 'react'
import { endpoints } from '../api/client'
import { useJobStatus } from '../api/useJobStatus'
import JsonViewer from '../components/JsonViewer'
import type { JobStatus } from '../types'

const SOURCE_OPTIONS = [
  'crowdstrike',
  'splunk',
  'paloalto',
  'microsoft',
  'logrhythm',
  'sentinel',
  'trendmicro',
  'expel',
]

const STATUS_LABEL: Record<JobStatus, string> = {
  QUEUED: 'Queued',
  ACTIVE: 'Processing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
}

const Submit = () => {
  const [rawLog, setRawLog] = useState('')
  const [source, setSource] = useState(SOURCE_OPTIONS[0])
  const [format, setFormat] = useState('json')
  const [jobId, setJobId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { job, error: streamError, transport } = useJobStatus(jobId)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    setJobId(null)
    setSubmitting(true)
    try {
      const { jobId: newId } = await endpoints.enqueueNormalize({
        rawLog,
        source,
        format,
      })
      setJobId(newId)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  const onReset = () => {
    setJobId(null)
    setSubmitError(null)
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Submit log</h1>
        <p className="page-sub">
          Send a raw vendor alert to the SLM for OCSF normalization. Status streams live via SSE.
        </p>
      </header>

      <section className="card">
        <form className="submit-form" onSubmit={onSubmit}>
          <div className="form-row">
            <label htmlFor="source">Source</label>
            <select
              id="source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={submitting}
            >
              {SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label htmlFor="format">Format</label>
            <select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              disabled={submitting}
            >
              <option value="json">json</option>
              <option value="cef">cef</option>
              <option value="syslog">syslog</option>
            </select>
          </div>

          <div className="form-row form-row--full">
            <label htmlFor="rawLog">Raw log</label>
            <textarea
              id="rawLog"
              value={rawLog}
              onChange={(e) => setRawLog(e.target.value)}
              rows={12}
              placeholder='{"alert_id":"...","severity":"high",...}'
              disabled={submitting}
              required
            />
          </div>

          <div className="form-actions">
            <button type="submit" disabled={submitting || !rawLog.trim()}>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
            {jobId && (
              <button type="button" onClick={onReset} disabled={submitting}>
                New submission
              </button>
            )}
          </div>

          {submitError && <div className="form-error">{submitError}</div>}
        </form>
      </section>

      {jobId && (
        <section className="card">
          <div className="job-status-header">
            <div>
              <div className="muted">Job ID</div>
              <code>{jobId}</code>
            </div>
            <div>
              <div className="muted">Status</div>
              <strong>{job ? STATUS_LABEL[job.status] : 'Connecting…'}</strong>
            </div>
            <div>
              <div className="muted">Transport</div>
              <span>{transport}</span>
            </div>
          </div>

          {streamError && <div className="form-error">{streamError}</div>}

          {job?.status === 'COMPLETED' && job.result && (
            <div className="job-result">
              <div className="job-meta">
                <span>
                  decision: <strong>{job.result.decision}</strong>
                </span>
                <span>
                  confidence: <strong>{job.result.confidence.toFixed(3)}</strong>
                </span>
                <span>
                  latency: <strong>{job.result.processingTimeMs} ms</strong>
                </span>
              </div>
              <h3>OCSF</h3>
              <JsonViewer data={job.result.ocsf} maxHeight={400} />
            </div>
          )}

          {job?.status === 'FAILED' && (
            <div className="form-error">
              <strong>Job failed:</strong> {job.error ?? 'unknown error'}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default Submit
