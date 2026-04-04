import { endpoints } from '../api/client'
import { useApi } from '../api/useApi'
import StatusDot from '../components/StatusDot'
import { formatMinutes } from '../utils/time'
import type { DotColor } from '../components/StatusDot'
import type { SLMHealth, SystemMetrics } from '../types'

interface ServiceRow {
  name: string
  status: string
  dot: DotColor
}

const parseSLMStatus = (slm: string | SLMHealth | undefined): string => {
  if (!slm) return 'Unknown'
  if (typeof slm === 'string') return slm
  return slm.status === 'healthy' ? 'Ready' : slm.status
}

const isSLMHealthy = (slm: string | SLMHealth | undefined): boolean => {
  if (typeof slm === 'string') return slm === 'healthy'
  if (typeof slm === 'object' && slm !== null) return slm.status === 'healthy'
  return false
}

const getSLMMetrics = (slm: string | SLMHealth | undefined): SystemMetrics | undefined => {
  if (typeof slm === 'object' && slm !== null) return slm.system
  return undefined
}

const formatUptime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

const memoryDot = (percent: number): DotColor => {
  if (percent < 70) return 'green'
  if (percent < 90) return 'amber'
  return 'red'
}

const Health = () => {
  const { data: health, loading } = useApi(() => endpoints.health(), [])
  const { data: queue } = useApi(() => endpoints.reviewQueue(), [])

  const dbOk     = health?.database === 'connected'
  const slmOk    = isSLMHealthy(health?.slm_service)
  const cbOk     = health?.circuit_breaker === 'Closed'
  const queueOk  = (queue?.pendingCount ?? 0) < 50
  const queueWarn = (queue?.pendingCount ?? 0) >= 10

  const backendMetrics = health?.system
  const slmMetrics     = getSLMMetrics(health?.slm_service)

  const services: ServiceRow[] = [
    {
      name: 'PostgreSQL',
      status: dbOk ? 'Connected' : 'Disconnected',
      dot: dbOk ? 'green' : 'red',
    },
    {
      name: 'Python SLM service',
      status: parseSLMStatus(health?.slm_service),
      dot: slmOk ? 'green' : 'red',
    },
    {
      name: 'Circuit breaker',
      status: cbOk ? 'Closed (healthy)' : 'Opened (tripped)',
      dot: cbOk ? 'green' : 'red',
    },
    {
      name: 'Review queue',
      status: queue
        ? `${queue.pendingCount} pending · Oldest: ${formatMinutes(queue.oldestMinutes)}`
        : 'Unknown',
      dot: queueOk ? (queueWarn ? 'amber' : 'green') : 'red',
    },
  ]

  const jobs: ServiceRow[] = [
    { name: 'Reprocess job', status: 'Every 5m', dot: 'green' },
    { name: 'SQS retry job', status: 'Every 1m', dot: 'green' },
  ]

  const allNominal = services.every((s) => s.dot === 'green')

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">System health</h1>
        <span className="page-sub">
          {loading ? 'Checking...' : allNominal ? 'All services nominal' : 'Issues detected'}
        </span>
      </div>

      {/* -- Services -- */}
      <div className="card mb-12">
        <div className="card-title">Services</div>
        {services.map(({ name, status, dot }) => (
          <div key={name} className="health-row">
            <StatusDot color={dot} />
            <span className="health-name">{name}</span>
            <span className="health-status">{status}</span>
          </div>
        ))}
      </div>

      {/* -- System metrics  -- */}
      <div className="grid-2 mb-12">
        <MetricsCard title="Backend (NestJS)" metrics={backendMetrics} />
        <MetricsCard title="SLM service (Python)" metrics={slmMetrics} showGpu />
      </div>

      {/* -- Scheduled jobs -- */}
      <div className="card">
        <div className="card-title">Scheduled jobs</div>
        {jobs.map(({ name, status, dot }) => (
          <div key={name} className="health-row">
            <StatusDot color={dot} />
            <span className="health-name">{name}</span>
            <span className="health-status">{status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* -- Metrics card sub-component -- */

interface MetricsCardProps {
  title: string
  metrics: SystemMetrics | undefined
  showGpu?: boolean
}

const MetricsCard = ({ title, metrics, showGpu }: MetricsCardProps) => {
  if (!metrics) {
    return (
      <div className="card">
        <div className="card-title">{title}</div>
        <div className="empty">Unavailable</div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-title">{title}</div>

      <div className="health-row">
        <StatusDot color={memoryDot(metrics.memory_percent)} />
        <span className="health-name">Memory</span>
        <span className="health-status">
          {metrics.memory_used_mb}MB / {metrics.memory_total_mb}MB ({metrics.memory_percent}%)
        </span>
      </div>

      <div className="health-row">
        <StatusDot color="green" />
        <span className="health-name">CPU</span>
        <span className="health-status">
          {metrics.cpu_percent != null
            ? `${metrics.cpu_percent}%`
            : `Load: ${metrics.cpu_load_avg_1m}`
          } · {metrics.cpu_cores} cores
        </span>
      </div>

      <div className="health-row">
        <StatusDot color="green" />
        <span className="health-name">Uptime</span>
        <span className="health-status">{formatUptime(metrics.uptime_seconds)}</span>
      </div>

      {showGpu && metrics.gpu_memory_total_mb != null && (
        <div className="health-row">
          <StatusDot color={memoryDot(metrics.gpu_memory_percent ?? 0)} />
          <span className="health-name">GPU memory</span>
          <span className="health-status">
            {metrics.gpu_memory_used_mb}MB / {metrics.gpu_memory_total_mb}MB
            ({metrics.gpu_memory_percent}%)
          </span>
        </div>
      )}

      {showGpu && metrics.gpu_utilization_percent != null && (
        <div className="health-row">
          <StatusDot color={metrics.gpu_utilization_percent > 90 ? 'amber' : 'green'} />
          <span className="health-name">GPU utilization</span>
          <span className="health-status">{metrics.gpu_utilization_percent}%</span>
        </div>
      )}
    </div>
  )
}

export default Health