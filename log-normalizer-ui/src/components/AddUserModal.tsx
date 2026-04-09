import { useEffect, useRef, useState } from 'react'
import { ApiError, endpoints } from '../api/client'
import type { User, UserRole } from '../types'

interface AddUserModalProps {
  onClose: () => void
  onCreated: (user: User) => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const IconClose = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const IconMail = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </svg>
)

const IconLock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

const IconEye = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const IconEyeOff = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

const IconChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const IconAlertCircle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const IconSpinner = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="login-spinner" aria-hidden>
    <path d="M12 2a10 10 0 0 1 10 10" />
  </svg>
)

const AddUserModal = ({ onClose, onCreated }: AddUserModalProps) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState<UserRole>('ANALYST')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const validate = (): string | null => {
    if (!EMAIL_RE.test(email)) return 'Enter a valid email'
    if (password.length < 8) return 'Password must be at least 8 characters'
    return null
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const clientErr = validate()
    if (clientErr) {
      setError(clientErr)
      return
    }

    setSubmitting(true)
    try {
      const created = await endpoints.users.create({ email, password, role })
      onCreated(created)
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError('A user with that email already exists')
        } else if (err.status === 400) {
          setError(err.message || 'Invalid input')
        } else if (err.status === 401 || err.status === 403) {
          setError('You no longer have permission to create users')
        } else {
          setError(err.message || 'Could not create user')
        }
      } else {
        setError('Could not reach the server. Try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-user-title"
        ref={cardRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="add-user-title" className="modal-title">Add user</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <IconClose />
          </button>
        </header>

        <form className="modal-form" onSubmit={onSubmit} noValidate>
          {error && (
            <div className="modal-error" role="alert">
              <IconAlertCircle />
              <span>{error}</span>
            </div>
          )}

          <div className="login-field">
            <label htmlFor="add-user-email" className="login-field-label">Email</label>
            <div className="login-input-wrap">
              <span className="login-input-icon"><IconMail /></span>
              <input
                id="add-user-email"
                className="login-input login-input--with-icon"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                autoComplete="off"
                aria-invalid={!!error}
                disabled={submitting}
                placeholder="user@company.com"
                required
              />
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="add-user-password" className="login-field-label">Password</label>
            <div className="login-input-wrap">
              <span className="login-input-icon"><IconLock /></span>
              <input
                id="add-user-password"
                className="login-input login-input--with-icon login-input--password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                aria-invalid={!!error}
                aria-describedby="add-user-password-hint"
                disabled={submitting}
                placeholder="••••••••"
                required
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
            <p id="add-user-password-hint" className="modal-hint">Minimum 8 characters</p>
          </div>

          <div className="login-field">
            <label htmlFor="add-user-role" className="login-field-label">Role</label>
            <div className="modal-select-wrap">
              <select
                id="add-user-role"
                className="modal-select"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                disabled={submitting}
              >
                <option value="ANALYST">ANALYST</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <span className="modal-select-chevron"><IconChevronDown /></span>
            </div>
          </div>

          <footer className="modal-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
            >
              {submitting ? <><IconSpinner /> Creating…</> : 'Create user'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

export default AddUserModal
