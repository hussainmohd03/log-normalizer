import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { endpoints } from '../api/client'
import { useApi } from '../api/useApi'
import StatCard from '../components/StatCard'

const DECISION_COLORS: Record<string, string> = {
  ACCEPT:  'green',
  REVIEW:  'amber',
  REJECT:  'red',
}

const Dashboard = () => {
  const { data: overview }  = useApi(() => endpoints.overview(), [])
  const { data: timeline }  = useApi(() => endpoints.timeline(7), [])
  const { data: sources }   = useApi(() => endpoints.bySource(), [])
  const { data: decisions } = useApi(() => endpoints.byDecision(), [])

  const chartData = (timeline ?? []).map((t) => ({
    time: new Date(t.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    count: t.count,
  }))

  const confidenceBadge = (overview?.avgConfidence ?? 0) >= 0.85
    ? { text: 'Healthy', color: 'green' }
    : { text: 'Low', color: 'amber' }

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <span className="page-sub">Last updated: just now</span>
      </div>

      {/* -- Stat cards -- */}
      <div className="cards-row">
        <StatCard
          label="Logs processed"
          value={(overview?.totalLogs ?? 0).toLocaleString()}
          sub="Last 24h"
          accent
        />
        <StatCard
          label="Avg confidence"
          value={(overview?.avgConfidence ?? 0).toFixed(2)}
          valueColor="var(--teal)"
          badge={confidenceBadge}
        />
        <StatCard
          label="Avg latency"
          value={Math.round(overview?.avgLatencyMs ?? 0)}
          unit="ms"
        />
        <StatCard
          label="Success rate"
          value={`${(overview?.successRate ?? 0).toFixed(1)}%`}
          valueColor="var(--green)"
          sub={`${(overview?.reviewRate ?? 0).toFixed(1)}% to review`}
        />
      </div>

      {/* -- Timeline chart -- */}
      <div className="card mb-14">
        <div className="card-title">Throughput (7 days)</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barSize={24}>
            <CartesianGrid stroke="#2A3450" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: '#6B7280' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#6B7280' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: '#1A2235',
                border: '1px solid #2A3450',
                borderRadius: 8,
                fontSize: 12,
              }}
              cursor={{ fill: 'rgba(0, 201, 167, 0.06)' }}
              labelStyle={{ color: '#9CA3AF', fontSize: 11 }}
              itemStyle={{ color: '#00C9A7', fontSize: 12 }}
            />
            <Bar dataKey="count" name="Logs" fill="#00C9A7" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* -- Source + decision tables -- */}
      <div className="grid-2">
        <div className="card">
          <div className="card-title">By source</div>
          <table className="data-table">
            <tbody>
              {(sources ?? []).map((s) => (
                <tr key={s.source}>
                  <td>{s.source}</td>
                  <td>{s.count.toLocaleString()}</td>
                </tr>
              ))}
              {!sources?.length && (
                <tr><td colSpan={2} className="empty">No data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">By decision</div>
          <table className="data-table">
            <tbody>
              {(decisions ?? []).map((d) => (
                <tr key={d.decision}>
                  <td>
                    <span className={`badge badge--${DECISION_COLORS[d.decision] ?? 'teal'}`}>
                      {d.decision}
                    </span>
                  </td>
                  <td>{d.count.toLocaleString()} ({d.percentage.toFixed(1)}%)</td>
                </tr>
              ))}
              {!decisions?.length && (
                <tr><td colSpan={2} className="empty">No data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
