import { useAuth } from '../api/auth'
import type { Page, UserRole } from '../types'

interface NavItem {
  id: Page
  label: string
  requiresRole?: UserRole
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'review',    label: 'Review queue' },
  { id: 'metrics',   label: 'Metrics' },
  { id: 'health',    label: 'Health' },
  { id: 'users',         label: 'User management', requiresRole: 'ADMIN' },
  { id: 'training-data', label: 'Training data',   requiresRole: 'ADMIN' },
]

interface LayoutProps {
  activePage: Page
  onNavigate: (page: Page) => void
  children: React.ReactNode
}

const Layout = ({ activePage, onNavigate, children }: LayoutProps) => {
  const { user, logout } = useAuth()

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.requiresRole || item.requiresRole === user?.role,
  )

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">L</div>
          <div>
            <div className="sidebar-brand-name">Log Normalizer</div>
            <div className="sidebar-brand-sub">Beyon Cyber</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {visibleNavItems.map(({ id, label }) => (
            <button
              key={id}
              className={`nav-item ${activePage === id ? 'nav-item--active' : ''}`}
              onClick={() => onNavigate(id)}
            >
              <span className="nav-dot" />
              {label}
            </button>
          ))}
        </nav>

        {user && (
          <div className="sidebar-user">
            <div className="sidebar-user-email">{user.email}</div>
            <div className="sidebar-user-role">{user.role}</div>
            <button className="sidebar-logout" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        )}
      </aside>

      <main className="content">{children}</main>
    </div>
  )
}

export default Layout
