import type { UserRole } from '../types'

interface RoleBadgeProps {
  role: UserRole
}

const RoleBadge = ({ role }: RoleBadgeProps) => (
  <span className={`role-badge role-badge--${role.toLowerCase()}`}>{role}</span>
)

export default RoleBadge
