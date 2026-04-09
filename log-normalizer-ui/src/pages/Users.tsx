// TODO(nav): wire `users` into Layout.tsx NAV_ITEMS (admin only)
// and add { page === 'users' && <Users /> } to App.tsx routing.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../api/auth'
import { ApiError, endpoints } from '../api/client'
import AddUserModal from '../components/AddUserModal'
import UserTable from '../components/UserTable'
import type { User } from '../types'

const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const IconAlertCircle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const IconShieldOff = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M19.69 14a6.9 6.9 0 0 0 .31-2V5l-8-3-3.16 1.18" />
    <path d="M4.73 4.73 4 5v7c0 6 8 10 8 10a20.29 20.29 0 0 0 5.62-4.38" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const SkeletonRow = () => (
  <tr className="user-row user-row--skeleton" aria-hidden>
    <td className="user-cell"><div className="skeleton-bar" style={{ width: 180 }} /></td>
    <td className="user-cell"><div className="skeleton-bar" style={{ width: 60 }} /></td>
    <td className="user-cell"><div className="skeleton-bar" style={{ width: 90 }} /></td>
    <td className="user-cell"><div className="skeleton-bar" style={{ width: 100 }} /></td>
    <td className="user-cell" />
  </tr>
)

const SkeletonTable = () => (
  <div className="user-table-card">
    <table className="user-table">
      <thead>
        <tr>
          <th scope="col">Email</th>
          <th scope="col">Role</th>
          <th scope="col">Created</th>
          <th scope="col">Last login</th>
          <th scope="col" className="user-table-actions-col"><span className="visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </tbody>
    </table>
  </div>
)

const Users = () => {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [users, setUsers] = useState<User[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoadError(null)
    try {
      const list = await endpoints.users.list()
      setUsers(list)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load users')
    }
  }, [])

  useEffect(() => {
    if (isAdmin) void fetchUsers()
  }, [isAdmin, fetchUsers])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 3000)
    return () => clearTimeout(t)
  }, [flash])

  if (!isAdmin || !user) {
    return (
      <div className="users-403">
        <div className="users-403-icon"><IconShieldOff /></div>
        <h1 className="users-403-title">403 — Admin access required</h1>
        <p className="users-403-body">You need admin privileges to view this page.</p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => window.history.back()}
        >
          Go back
        </button>
      </div>
    )
  }

  const handleCreated = (created: User) => {
    setUsers((prev) => (prev ? [...prev, created] : [created]))
    setFlash({ kind: 'success', message: `Created ${created.email}` })
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await endpoints.users.delete(id)
      setUsers((prev) => prev?.filter((u) => u.id !== id) ?? null)
      setFlash({ kind: 'success', message: 'User deleted' })
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 400
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not delete user'
      setFlash({ kind: 'error', message: msg })
    } finally {
      setDeletingId(null)
    }
  }

  const total = users?.length ?? 0
  const adminCount = users?.filter((u) => u.role === 'ADMIN').length ?? 0
  const subtitle =
    users === null
      ? 'Loading…'
      : `${total} user${total === 1 ? '' : 's'} · ${adminCount} admin${adminCount === 1 ? '' : 's'}`

  return (
    <div className="users-page">
      <header className="users-header">
        <div>
          <h1 className="users-title">User management</h1>
          <p className="users-subtitle">{subtitle}</p>
        </div>
        <button
          type="button"
          className="btn-primary users-add-btn"
          onClick={() => setShowModal(true)}
        >
          <IconPlus /> Add user
        </button>
      </header>

      {flash && (
        <div className={`users-flash users-flash--${flash.kind}`} role="status">
          {flash.message}
        </div>
      )}

      {loadError ? (
        <div className="users-error" role="alert">
          <IconAlertCircle />
          <div>
            <div className="users-error-title">Couldn’t load users</div>
            <div className="users-error-body">{loadError}</div>
          </div>
          <button type="button" className="btn-ghost" onClick={() => void fetchUsers()}>
            Retry
          </button>
        </div>
      ) : users === null ? (
        <SkeletonTable />
      ) : users.length === 0 ? (
        <div className="user-empty">
          <p className="user-empty-title">No users yet</p>
          <p className="user-empty-body">Add your first user to get started</p>
          <button type="button" className="btn-primary" onClick={() => setShowModal(true)}>
            <IconPlus /> Add user
          </button>
        </div>
      ) : (
        <UserTable
          users={users}
          currentUserEmail={user.email}
          onDelete={handleDelete}
          deletingId={deletingId}
        />
      )}

      {showModal && (
        <AddUserModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}

export default Users
