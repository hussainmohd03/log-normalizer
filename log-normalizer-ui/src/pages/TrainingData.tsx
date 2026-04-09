import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../api/auth'
import { ApiError, endpoints } from '../api/client'
import type { TrainingDataStats } from '../types'
import { formatDate, timeAgo } from '../utils/time'

const IconShieldOff = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M19.69 14a6.9 6.9 0 0 0 .31-2V5l-8-3-3.16 1.18" />
    <path d="M4.73 4.73 4 5v7c0 6 8 10 8 10a20.29 20.29 0 0 0 5.62-4.38" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const IconAlertCircle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const IconSpinner = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="login-spinner" aria-hidden>
    <path d="M12 2a10 10 0 0 1 10 10" />
  </svg>
)

const IconDownload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

const SkeletonStat = () => (
  <div className="td-stat-card td-stat-card--skeleton" aria-hidden>
    <div className="skeleton-bar" style={{ width: '60%', height: 12 }} />
    <div className="skeleton-bar" style={{ width: '40%', height: 28, marginTop: 10 }} />
    <div className="skeleton-bar" style={{ width: '50%', height: 10, marginTop: 10 }} />
  </div>
)

const SkeletonHistoryRow = () => (
  <tr className="td-history-row td-history-row--skeleton" aria-hidden>
    <td className="td-history-cell"><div className="skeleton-bar" style={{ width: 140 }} /></td>
    <td className="td-history-cell"><div className="skeleton-bar" style={{ width: 180 }} /></td>
    <td className="td-history-cell"><div className="skeleton-bar" style={{ width: 60 }} /></td>
  </tr>
)

const formatExportedAt = (iso: string): string => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60_000))
  if (days > 7) return formatDate(iso)
  return timeAgo(iso)
}

const filenameFromContentDisposition = (header: string | null): string | null => {
  if (!header) return null
  const match = header.match(/filename="?([^"]+)"?/)
  return match ? match[1] : null
}

const TrainingData = () => {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [stats, setStats] = useState<TrainingDataStats | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error' | 'info'; message: string } | null>(null)

  const fetchStats = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoadError(null)
    try {
      const next = await endpoints.trainingData.stats()
      setStats(next)
      setLoadError(null)
    } catch (err) {
      if (!silent) {
        setLoadError(err instanceof Error ? err.message : 'Could not load training data stats')
      }
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) void fetchStats()
  }, [isAdmin, fetchStats])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 5000)
    return () => clearTimeout(t)
  }, [flash])

  if (!isAdmin || !user) {
    return (
      <div className="users-403">
        <div className="users-403-icon"><IconShieldOff /></div>
        <h1 className="users-403-title">403 — Admin access required</h1>
        <p className="users-403-body">You need admin privileges to view this page.</p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => window.history.back()}
        >
          Go back
        </button>
      </div>
    )
  }

  const handleExport = async () => {
    if (!stats || stats.pendingExport === 0 || exporting) return
    setExporting(true)
    setFlash(null)
    try {
      const res = await endpoints.trainingData.export()
      const recordCount = Number(res.headers.get('X-Record-Count') ?? '0')
      const filename =
        filenameFromContentDisposition(res.headers.get('Content-Disposition')) ??
        `training-export-${new Date().toISOString().slice(0, 10)}.jsonl`

      const text = await res.text()
      const blob = new Blob([text], { type: 'application/x-ndjson' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setFlash({
        kind: 'success',
        message: `Exported ${recordCount} correction${recordCount === 1 ? '' : 's'}`,
      })
      await fetchStats(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setFlash({ kind: 'info', message: 'No corrections available to export' })
        await fetchStats(true)
      } else {
        setFlash({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Export failed',
        })
      }
    } finally {
      setExporting(false)
    }
  }

  const pending = stats?.pendingExport ?? 0
  const exportDisabled = !stats || pending === 0 || exporting
  const buttonLabel = exporting
    ? 'Exporting…'
    : `Export ${pending} correction${pending === 1 ? '' : 's'}`

  return (
    <div className="td-page">
      <header className="td-header">
        <div>
          <h1 className="td-title">Training data</h1>
          <p className="td-subtitle">
            Export analyst corrections as training data for future fine-tuning.
          </p>
        </div>
        {refreshing && (
          <span className="td-refreshing" aria-label="Refreshing"><IconSpinner /></span>
        )}
      </header>

      {loadError ? (
        <div className="users-error" role="alert">
          <IconAlertCircle />
          <div>
            <div className="users-error-title">Couldn’t load training data</div>
            <div className="users-error-body">{loadError}</div>
          </div>
          <button type="button" className="btn-ghost" onClick={() => void fetchStats()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="td-stats-grid">
            {stats === null ? (
              <>
                <SkeletonStat />
                <SkeletonStat />
                <SkeletonStat />
                <SkeletonStat />
              </>
            ) : (
              <>
                <div className="td-stat-card">
                  <div className="td-stat-label">Total corrections</div>
                  <div className="td-stat-value">{stats.totalCorrections}</div>
                  <div className="td-stat-sub">in the database</div>
                </div>
                <div className="td-stat-card">
                  <div className="td-stat-label">Pending export</div>
                  <div
                    className={`td-stat-value ${stats.pendingExport > 0 ? 'td-stat-value--accent' : 'td-stat-value--muted'}`}
                  >
                    {stats.pendingExport}
                  </div>
                  <div className="td-stat-sub">ready to download</div>
                </div>
                <div className="td-stat-card">
                  <div className="td-stat-label">Already exported</div>
                  <div className="td-stat-value">{stats.alreadyExported}</div>
                  <div className="td-stat-sub">in past exports</div>
                </div>
                <div className="td-stat-card">
                  <div className="td-stat-label">Last export</div>
                  <div className="td-stat-value td-stat-value--small">
                    {stats.lastExportAt ? formatDate(stats.lastExportAt) : 'Never'}
                  </div>
                  <div className="td-stat-sub">
                    {stats.lastExportAt ? timeAgo(stats.lastExportAt) : '\u00A0'}
                  </div>
                </div>
              </>
            )}
          </div>

          <section className="td-export-card">
            <div className="td-export-head">
              <h2 className="td-export-title">Export pending corrections</h2>
            </div>
            <p className="td-export-body">
              Download all unexported corrections as a JSONL file in the SLM training format.
              The exported rows will be marked as exported and won’t be included in future exports.
            </p>

            {flash && (
              <div className={`td-flash td-flash--${flash.kind}`} role="status">
                {flash.message}
              </div>
            )}

            {stats !== null && pending === 0 ? (
              <div className="td-export-empty">
                No new corrections to export. Submit corrections from the review queue to
                populate this.
              </div>
            ) : (
              <button
                type="button"
                className="btn-primary td-export-btn"
                onClick={() => void handleExport()}
                disabled={exportDisabled}
              >
                {exporting ? <IconSpinner /> : <IconDownload />} {buttonLabel}
              </button>
            )}
          </section>

          <section className="td-history-section">
            <h2 className="td-history-title">Recent exports</h2>
            <div className="td-history-card">
              <table className="td-history-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Exported by</th>
                    <th scope="col">Records</th>
                  </tr>
                </thead>
                <tbody>
                  {stats === null ? (
                    <>
                      <SkeletonHistoryRow />
                      <SkeletonHistoryRow />
                      <SkeletonHistoryRow />
                    </>
                  ) : stats.exportHistory.length === 0 ? (
                    <tr>
                      <td className="td-history-empty" colSpan={3}>
                        No exports yet
                      </td>
                    </tr>
                  ) : (
                    stats.exportHistory.map((row) => (
                      <tr key={row.id} className="td-history-row">
                        <td className="td-history-cell">{formatExportedAt(row.exportedAt)}</td>
                        <td className="td-history-cell td-history-cell-muted">
                          {row.exportedByEmail}
                        </td>
                        <td className="td-history-cell">{row.recordCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

export default TrainingData
