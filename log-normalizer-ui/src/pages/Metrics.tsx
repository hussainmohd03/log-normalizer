import { endpoints } from '../api/client'
import { useApi } from '../api/useApi'
import StatCard from '../components/StatCard'

const confColor = (val: number): string => {
  if (val >= 0.88) return 'var(--green)'
  if (val >= 0.83) return 'var(--teal)'
  return 'var(--amber)'
}

const Metrics = () => {
  const { data: overview } = useApi(() => endpoints.overview(), [])
  const { data: sources }  = useApi(() => endpoints.bySource(), [])

  const byConfidence = [...(sources ?? [])].sort((a, b) => b.avgConfidence - a.avgConfidence)
  const byLatency    = [...(sources ?? [])].sort((a, b) => a.avgLatencyMs - b.avgLatencyMs)

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Metrics</h1>
        <span className="page-sub">All time</span>
      </div>

      <div className="cards-row">
        <StatCard
          label="Total processed"
          value={(overview?.totalLogs ?? 0).toLocaleString()}
          accent
        />
        <StatCard
          label="Avg confidence"
          value={(overview?.avgConfidence ?? 0).toFixed(2)}
          valueColor="var(--teal)"
        />
        <StatCard
          label="Avg latency"
          value={Math.round(overview?.avgLatencyMs ?? 0)}
          unit="ms"
        />
        <StatCard
          label="Review rate"
          value={`${(overview?.reviewRate ?? 0).toFixed(1)}%`}
        />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Confidence by source</div>
          <table className="data-table">
            <tbody>
              {byConfidence.map((s) => (
                <tr key={s.source}>
                  <td>{s.source}</td>
                  <td style={{ color: confColor(s.avgConfidence) }}>
                    {s.avgConfidence.toFixed(2)}
                  </td>
                </tr>
              ))}
              {!sources?.length && (
                <tr><td colSpan={2} className="empty">No data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">Latency by source</div>
          <table className="data-table">
            <tbody>
              {byLatency.map((s) => (
                <tr key={s.source}>
                  <td>{s.source}</td>
                  <td>{Math.round(s.avgLatencyMs)}ms</td>
                </tr>
              ))}
              {!sources?.length && (
                <tr><td colSpan={2} className="empty">No data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default Metrics
