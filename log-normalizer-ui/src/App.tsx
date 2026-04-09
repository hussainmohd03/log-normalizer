import { useState } from 'react'
import { AuthProvider, useAuth } from './api/auth'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Health from './pages/Health'
import Login from './pages/Login'
import Metrics from './pages/Metrics'
import ReviewQueue from './pages/ReviewQueue'
import TrainingData from './pages/TrainingData'
import Users from './pages/Users'
import type { Page } from './types'


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
      {page === 'users' && <Users />}
      {page === 'training-data' && <TrainingData />}
    </Layout>
  )
}

const App = () => (
  <AuthProvider>
    <AppShell />
  </AuthProvider>
)

export default App
