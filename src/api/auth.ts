import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AdminApiError, errorDetail, resetToSignedOut, sessionQueryKey, toSession } from './admin'
import { api } from './client'
import type { components } from './schema'

export { sessionQueryKey }

export type StaffMe = components['schemas']['StaffMe']
export type StaffRole = components['schemas']['StaffRole']
export type LoginRequest = components['schemas']['LoginRequest']
export type ChangePasswordRequest = components['schemas']['ChangePasswordRequest']

/** What the admin guards need to know about the current browser session. */
export type Session =
  | { state: 'signed-out' }
  | { state: 'must-change'; user: StaffMe }
  | { state: 'signed-in'; user: StaffMe }

/**
 * Reads GET /api/admin/auth/me. A 401 is a normal answer (signed-out), never an error.
 * A 200 with `must_change_password` maps to must-change. Anything else throws AdminApiError.
 */
export async function fetchSession(): Promise<Session> {
  const { data, error, response } = await api.GET('/api/admin/auth/me')
  if (data && response.status < 400) return toSession(data)
  if (response.status === 401) return { state: 'signed-out' }
  throw new AdminApiError(response.status, errorDetail(error))
}

export function useSession() {
  return useQuery({ queryKey: sessionQueryKey, queryFn: fetchSession, staleTime: 60_000 })
}

/** Login. On success drops any cached admin data and stores the new session. 401 → AdminApiError. */
export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: LoginRequest): Promise<StaffMe> => {
      const { data, error, response } = await api.POST('/api/admin/auth/login', { body })
      if (data && response.status < 400) return data
      throw new AdminApiError(response.status, errorDetail(error))
    },
    onSuccess: (user) => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionQueryKey[0] })
      qc.setQueryData<Session>(sessionQueryKey, toSession(user))
    },
  })
}

/** Logout (POST {} → 204). A 401 also counts as signed out. Clears every cached query on success. */
export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error, response } = await api.POST('/api/admin/auth/logout', { body: {} as never })
      if (response.status < 400 || response.status === 401) return
      throw new AdminApiError(response.status, errorDetail(error))
    },
    onSuccess: () => resetToSignedOut(qc),
  })
}

/** Change password. The server re-issues the cookie; the returned user replaces the session. */
export function useChangePassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: ChangePasswordRequest): Promise<StaffMe> => {
      const { data, error, response } = await api.POST('/api/admin/auth/change-password', { body })
      if (data && response.status < 400) return data
      if (response.status === 401) resetToSignedOut(qc)
      throw new AdminApiError(response.status, errorDetail(error))
    },
    onSuccess: (user) => qc.setQueryData<Session>(sessionQueryKey, toSession(user)),
  })
}
