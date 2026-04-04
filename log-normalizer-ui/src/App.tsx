import { useState } from 'react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ReviewQueue from './pages/ReviewQueue'
import Metrics from './pages/Metrics'
import Health from './pages/Health'
import type { Page } from './types'

const App = () => {
  const [page, setPage] = useState<Page>('dashboard')

  return (
    <Layout activePage={page} onNavigate={setPage}>
      {page === 'dashboard' && <Dashboard />}
      {page === 'review'    && <ReviewQueue />}
      {page === 'metrics'   && <Metrics />}
      {page === 'health'    && <Health />}
    </Layout>
  )
}

export default App
