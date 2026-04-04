interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  unit?: string
  valueColor?: string
  accent?: boolean
  badge?: { text: string; color: string }
}

const StatCard = ({ label, value, sub, unit, valueColor, accent, badge }: StatCardProps) => (
  <div className={`card ${accent ? 'card--accent' : ''}`}>
    <div className="stat-label">{label}</div>
    <div className="stat-value" style={valueColor ? { color: valueColor } : undefined}>
      {value}
      {unit && <span className="stat-unit">{unit}</span>}
    </div>
    {badge && (
      <div className="stat-sub">
        <span className={`badge badge--${badge.color}`}>{badge.text}</span>
      </div>
    )}
    {sub && !badge && <div className="stat-sub">{sub}</div>}
  </div>
)

export default StatCard
