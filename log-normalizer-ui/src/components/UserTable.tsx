import { useState } from 'react'
import type { User } from '../types'
import { formatDate, timeAgo } from '../utils/time'
import RoleBadge from './RoleBadge'

interface UserTableProps {
  users: User[]
  currentUserEmail: string
  onDelete: (id: string) => Promise<void>
  deletingId: string | null
}

const IconTrash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)

const IconSpinner = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="login-spinner" aria-hidden>
    <path d="M12 2a10 10 0 0 1 10 10" />
  </svg>
)

const formatLastLogin = (iso: string | null): React.ReactNode => {
  if (!iso) return <span className="user-cell-muted">Never</span>
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60_000))
  if (days > 7) return formatDate(iso)
  return timeAgo(iso)
}

const UserTable = ({ users, currentUserEmail, onDelete, deletingId }: UserTableProps) => {
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    setConfirmId(null)
    await onDelete(id)
  }

  return (
    <div className="user-table-card">
      <table className="user-table">
        <thead>
          <tr>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Created</th>
            <th scope="col">Last login</th>
            <th scope="col" className="user-table-actions-col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u.email === currentUserEmail
            const isDeleting = deletingId === u.id
            const isConfirming = confirmId === u.id

            return (
              <tr
                key={u.id}
                className={`user-row ${isDeleting ? 'user-row--deleting' : ''} ${isConfirming ? 'user-row--confirming' : ''}`}
              >
                <td className="user-cell user-cell-email">{u.email}</td>
                <td className="user-cell"><RoleBadge role={u.role} /></td>
                <td className="user-cell user-cell-muted">{formatDate(u.createdAt)}</td>
                <td className="user-cell user-cell-muted">{formatLastLogin(u.lastLoginAt)}</td>
                <td className="user-cell user-cell-actions">
                  {isSelf ? null : isDeleting ? (
                    <span className="user-deleting-indicator" aria-label="Deleting">
                      <IconSpinner />
                    </span>
                  ) : isConfirming ? (
                    <div className="user-confirm-actions">
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--sm"
                        onClick={() => setConfirmId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn-danger btn-danger--sm"
                        onClick={() => void handleDelete(u.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="user-delete-btn"
                      onClick={() => setConfirmId(u.id)}
                      aria-label={`Delete user ${u.email}`}
                    >
                      <IconTrash />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default UserTable
