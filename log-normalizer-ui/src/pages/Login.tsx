import { useState } from 'react'
import { useAuth } from '../api/auth'
import { ApiError } from '../api/client'

const Login = () => {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      // AuthProvider re-renders the tree as soon as user is set,
      // which mounts the dashboard. No navigation needed.
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Invalid email or password'
          : err instanceof Error
            ? err.message
            : 'Login failed',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          <div className="sidebar-logo">L</div>
          <div>
            <div className="sidebar-brand-name">Log Normalizer</div>
            <div className="sidebar-brand-sub">Beyon Cyber</div>
          </div>
        </div>

        <h1 className="login-title">Sign in</h1>

        <label className="login-label">
          <span>Email</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="email"
            disabled={submitting}
          />
        </label>

        <label className="login-label">
          <span>Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            disabled={submitting}
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button
          className="btn btn--primary"
          type="submit"
          disabled={submitting || !email || !password}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

export default Login
