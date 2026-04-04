export type DotColor = 'green' | 'amber' | 'red'

interface StatusDotProps {
  color: DotColor
}

const StatusDot = ({ color }: StatusDotProps) => (
  <span className={`status-dot status-dot--${color}`} />
)

export default StatusDot
