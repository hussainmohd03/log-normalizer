import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { UnauthorizedError, endpoints } from './client'
import type { AuthUser } from '../types'

interface AuthContextValue {
  user: AuthUser | null
  /** True until the initial /auth/me probe finishes. */
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Owns the React-side auth state. On mount it probes /auth/me to see
 * if the cookie is still valid (e.g. after a page reload), then either
 * sets `user` or leaves it null. Login/logout call the API and update
 * state.
 *
 * Any component anywhere can call useAuth() to read the user.
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Initial session check on mount.
  useEffect(() => {
    let cancelled = false
    endpoints
      .me()
      .then((u) => {
        if (!cancelled) setUser(u)
      })
      .catch((err) => {
        // 401 just means no active session — not an error to surface.
        if (!(err instanceof UnauthorizedError) && !cancelled) {
          // eslint-disable-next-line no-console
          console.warn('auth.me probe failed:', err)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const u = await endpoints.login(email, password)
    setUser(u)
  }, [])

  const logout = useCallback(async () => {
    try {
      await endpoints.logout()
    } finally {
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
