import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useSession } from '../api/auth'
import { ErrorState, Spinner } from '../ui'
import { adminCopy } from './copy'

/** Gate for every staff page except login. A mid-session 401 flips the session and lands here. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession()
  const location = useLocation()

  if (session.data === undefined) {
    if (session.isError) {
      return (
        <div className="admin-auth-state">
          <ErrorState
            data-testid="admin-auth-error"
            message={adminCopy.authError}
            retryLabel={adminCopy.retry}
            onRetry={() => void session.refetch()}
          />
        </div>
      )
    }
    return (
      <div className="admin-auth-state" data-testid="admin-auth-loading">
        <Spinner label={adminCopy.authLoading} />
      </div>
    )
  }

  if (session.data.state === 'signed-out') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/admin/login?next=${next}`} replace />
  }
  if (session.data.state === 'must-change' && location.pathname !== '/admin/account') {
    return <Navigate to="/admin/account" replace />
  }
  return <>{children}</>
}
