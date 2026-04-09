import { useState } from 'react'
import { AuthProvider, useAuth } from './api/auth'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Health from './pages/Health'
import Login from './pages/Login'
import Metrics from './pages/Metrics'
import ReviewQueue from './pages/ReviewQueue'
import type { Page } from './types'

/**
 * Inside the AuthProvider. Three states:
 *  - loading: initial /auth/me probe in flight → blank screen (avoids
 *    a flash of the login page on hard refresh)
 *  - no user: render the login screen
 *  - user: render the normal app shell
 */
const AppShell = () => {
  const { user, loading } = useAuth()
  const [page, setPage] = useState<Page>('dashboard')

  if (loading) return null
  if (!user) return <Login />

  return (
    <Layout activePage={page} onNavigate={setPage}>
      {page === 'dashboard' && <Dashboard />}
      {page === 'review' && <ReviewQueue />}
      {page === 'metrics' && <Metrics />}
      {page === 'health' && <Health />}
    </Layout>
  )
}

const App = () => (
  <AuthProvider>
    <AppShell />
  </AuthProvider>
)

export default App
