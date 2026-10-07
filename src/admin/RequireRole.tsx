import type { ReactNode } from 'react'
import { useSession, type StaffRole } from '../api/auth'
import { Forbidden } from './Forbidden'

/** Renders the in-place 403 page unless the signed-in user has one of the allowed roles. */
export function RequireRole({ allow, children }: { allow: StaffRole[]; children: ReactNode }) {
  const { data } = useSession()
  const role = data && data.state !== 'signed-out' ? data.user.role : null
  if (!role || !allow.includes(role)) return <Forbidden />
  return <>{children}</>
}
