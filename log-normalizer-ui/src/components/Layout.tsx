import type { Page } from '../types'

const NAV_ITEMS: { id: Page; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'review',    label: 'Review queue' },
  { id: 'metrics',   label: 'Metrics' },
  { id: 'health',    label: 'Health' },
]

interface LayoutProps {
  activePage: Page
  onNavigate: (page: Page) => void
  children: React.ReactNode
}

const Layout = ({ activePage, onNavigate, children }: LayoutProps) => (
  <div className="layout">
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">L</div>
        <div>
          <div className="sidebar-brand-name">LogNormalizer</div>
          <div className="sidebar-brand-sub">Beyon Cyber</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ id, label }) => (
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
    </aside>

    <main className="content">{children}</main>
  </div>
)

export default Layout
