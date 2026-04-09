import { useState } from 'react'
import { useAuth } from '../api/auth'
import { ApiError } from '../api/client'

/* ── Inline SVG icons ────────────────────────────────────────────────────
   Avoid pulling in lucide-react for four icons used on a single page.
   Each icon mirrors lucide's stroke geometry so the visual matches the
   spec without the dependency. */

const IconCheck = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const IconEye = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const IconEyeOff = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

const IconAlertCircle = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const IconSpinner = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    className="login-spinner"
    aria-hidden
  >
    <path d="M12 2a10 10 0 0 1 10 10" />
  </svg>
)

const Login = () => {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
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
    <div className="login-page">
      {/* ── Brand panel (left, hidden on mobile) ─────────────────────── */}
      <aside className="login-brand-panel">
        <div className="login-brand-grid" aria-hidden />

        <header className="login-brand-header">
          <div className="login-brand-mark">L</div>
          <div>
            <div className="login-brand-name">Log Normalizer</div>
            <div className="login-brand-sub">BEYON CYBER</div>
          </div>
        </header>

        <div className="login-brand-body">
          <h2 className="login-brand-headline">
            Security log normalization, structured.
          </h2>
          <p className="login-brand-tagline">
            Multi-vendor alerts to OCSF, on your infrastructure.
          </p>

          <ul className="login-brand-features">
            <li>
              <span className="login-feature-check">
                <IconCheck />
              </span>
              OCSF v1.7.0 compliant
            </li>
            <li>
              <span className="login-feature-check">
                <IconCheck />
              </span>
              8 SIEM integrations
            </li>
            <li>
              <span className="login-feature-check">
                <IconCheck />
              </span>
              Human-in-the-loop review
            </li>
          </ul>
        </div>

        <footer className="login-brand-footer">© 2025 Beyon Cyber — Bahrain</footer>
      </aside>

      {/* ── Form panel (right, full-width on mobile) ─────────────────── */}
      <main className="login-form-panel">
        <form className="login-form" onSubmit={onSubmit} noValidate>
          <div className="login-form-header">
            <h1 className="login-form-title">Sign in</h1>
            <p className="login-form-subtitle">Access your normalization workspace</p>
          </div>

          {error && (
            <div className="login-form-error" role="alert">
              <IconAlertCircle className="login-form-error-icon" />
              <span>{error}</span>
            </div>
          )}

          <div className="login-field">
            <label htmlFor="login-email" className="login-field-label">
              Email
            </label>
            <input
              id="login-email"
              className="login-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              aria-invalid={!!error}
              disabled={submitting}
              placeholder="you@company.com"
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password" className="login-field-label">
              Password
            </label>
            <div className="login-password-wrap">
              <input
                id="login-password"
                className="login-input login-input--password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                aria-invalid={!!error}
                disabled={submitting}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                disabled={submitting}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="login-submit"
            disabled={submitting || !email || !password}
          >
            {submitting ? (
              <>
                <IconSpinner />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>

          <p className="login-form-legal">
            Secure session — your credentials are never stored in the browser.
          </p>
        </form>
      </main>
    </div>
  )
}

export default Login
