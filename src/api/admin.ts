import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Session, StaffMe } from './auth'
import { api } from './client'
import type { components, paths } from './schema'

type S = components['schemas']
export type QueueResponse = S['QueueResponse']
export type FollowUpResponse = S['FollowUpResponse']
export type FollowUpItem = S['FollowUpItem']
export type FollowUpAckResponse = S['FollowUpAckResponse']
export type CallListResponse = S['CallListResponse']
export type CallDetail = S['CallDetail']
export type VoiceModeResponse = S['VoiceModeResponse']
export type VoiceMode = VoiceModeResponse['mode']
export type TimelineEntry = CallDetail['timeline'][number]
export type TimelineTurn = S['TimelineTurn']
export type TimelineAction = S['TimelineAction']
export type TimelineFlag = S['TimelineFlag']
export type FormDetail = S['FormDetail']
export type FieldEditRequest = S['FieldEditRequest']
export type AuditListResponse = S['AuditListResponse']
export type ExportPendingResponse = S['ExportPendingResponse']
export type ExportResponse = S['ExportResponse']
export type ReportsResponse = S['ReportsResponse']
export type HomeResponse = S['HomeResponse']
export type HomeSetup = S['HomeSetup']
export type CallsParams = NonNullable<paths['/api/admin/calls']['get']['parameters']['query']>
export type AuditParams = NonNullable<paths['/api/admin/audit']['get']['parameters']['query']>
export type ReportsParams = NonNullable<paths['/api/admin/reports']['get']['parameters']['query']>

export const sessionQueryKey = ['session'] as const

export function toSession(user: StaffMe): Session {
  return user.must_change_password ? { state: 'must-change', user } : { state: 'signed-in', user }
}

/** Typed failure of any admin/auth request. `detail` is the server's string detail when present. */
export class AdminApiError extends Error {
  readonly status: number
  readonly detail: string | null
  constructor(status: number, detail: string | null) {
    super(detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`)
    this.name = 'AdminApiError'
    this.status = status
    this.detail = detail
  }
  get isUnauthorized() {
    return this.status === 401
  }
  get isForbidden() {
    return this.status === 403
  }
  get isPasswordChangeRequired() {
    return this.status === 403 && this.detail === 'password_change_required'
  }
  get isNotFound() {
    return this.status === 404
  }
  get isConflict() {
    return this.status === 409
  }
}

export function errorDetail(error: unknown): string | null {
  if (error && typeof error === 'object' && 'detail' in error) {
    const d = (error as { detail: unknown }).detail
    return typeof d === 'string' ? d : null
  }
  return null
}

/**
 * Drops every cached query except the session (kept so its observers update) and signs out.
 * Queries still in flight are spared so the failing request can settle into its error state;
 * login removes them later.
 */
export function resetToSignedOut(qc: QueryClient): void {
  qc.removeQueries({
    predicate: (q) => q.queryKey[0] !== sessionQueryKey[0] && q.state.fetchStatus !== 'fetching',
  })
  qc.getMutationCache().clear()
  qc.setQueryData<Session>(sessionQueryKey, { state: 'signed-out' })
}

interface ApiResult<T> {
  data?: T
  error?: unknown
  response: { status: number }
}

/**
 * Unwraps every admin response. 401 → clear cache + session signed-out (guards redirect);
 * 403 password_change_required → session must-change; then throws AdminApiError.
 */
export function handle<T>(qc: QueryClient, { data, error, response }: ApiResult<T>): T {
  const status = response.status
  if (error === undefined && status < 400) return data as T
  const detail = errorDetail(error)
  if (status === 401) {
    resetToSignedOut(qc)
  } else if (status === 403 && detail === 'password_change_required') {
    const current = qc.getQueryData<Session>(sessionQueryKey)
    if (current && current.state !== 'signed-out') {
      const next: Session = { state: 'must-change', user: current.user }
      qc.setQueryData<Session>(sessionQueryKey, next)
    } else {
      void qc.invalidateQueries({ queryKey: sessionQueryKey })
    }
  }
  throw new AdminApiError(status, detail)
}

export const adminKeys = {
  all: ['admin'] as const,
  queue: () => ['admin', 'queue'] as const,
  followUp: () => ['admin', 'follow-up'] as const,
  calls: (params: CallsParams) => ['admin', 'calls', params] as const,
  callDetail: (callId: string) => ['admin', 'call-detail', callId] as const,
  audit: (params: AuditParams) => ['admin', 'audit', params] as const,
  exportsPending: () => ['admin', 'exports'] as const,
  voiceMode: () => ['admin', 'settings', 'voice-mode'] as const,
  reports: (params: ReportsParams) => ['admin', 'reports', params] as const,
}

/** Marks admin lists stale (not the call detail, whose cache the mutation already wrote). */
function invalidateLists(qc: QueryClient) {
  return qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] === 'admin' && q.queryKey[1] !== 'call-detail',
  })
}

/** Home: today's numbers, line status and the setup checklist. Keyed under the config prefix so
 * every setup change (save, make live, discard, example) refreshes it. */
export function useHome() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['admin', 'config', 'home'] as const,
    queryFn: async () => handle(qc, await api.GET('/api/admin/home')),
  })
}

export function useQueue() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: adminKeys.queue(),
    queryFn: async () => handle(qc, await api.GET('/api/admin/queue')),
  })
}

export function useFollowUp() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: adminKeys.followUp(),
    queryFn: async () => handle(qc, await api.GET('/api/admin/follow-up')),
  })
}

/** One page of calls; pass `cursor` (from `next_cursor`) in params for the next page. */
export function useCalls(params: CallsParams) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: adminKeys.calls(params),
    queryFn: async () => handle(qc, await api.GET('/api/admin/calls', { params: { query: params } })),
    placeholderData: keepPreviousData,
  })
}

export function useCallDetail(callId: string) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: adminKeys.callDetail(callId),
    queryFn: async () =>
      handle(qc, await api.GET('/api/admin/calls/{call_id}', { params: { path: { call_id: callId } } })),
    enabled: callId !== '',
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })
}

export function useAuditLog(params: AuditParams) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: adminKeys.audit(params),
    queryFn: async () => handle(qc, await api.GET('/api/admin/audit', { params: { query: params } })),
    placeholderData: keepPreviousData,
  })
}

export function useExportsPending() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: adminKeys.exportsPending(),
    queryFn: async () => handle(qc, await api.GET('/api/admin/exports')),
  })
}

export function useReports(params: ReportsParams) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: adminKeys.reports(params),
    queryFn: async () => handle(qc, await api.GET('/api/admin/reports', { params: { query: params } })),
    placeholderData: keepPreviousData,
  })
}

function writeForm(qc: QueryClient, callId: string, form: FormDetail) {
  qc.setQueryData<CallDetail>(adminKeys.callDetail(callId), (old) => (old ? { ...old, form } : old))
  void invalidateLists(qc)
}

const path = (callId: string) => ({ params: { path: { call_id: callId } } })

export function useEditField(callId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: FieldEditRequest) =>
      handle(qc, await api.POST('/api/admin/calls/{call_id}/form/fields', { ...path(callId), body })),
    onSuccess: (form) => writeForm(qc, callId, form),
  })
}

export function useApprove(callId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      handle(qc, await api.POST('/api/admin/calls/{call_id}/form/approve', { ...path(callId), body: {} })),
    onSuccess: (form) => writeForm(qc, callId, form),
  })
}

export function useReject(callId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (reason: string) =>
      handle(qc, await api.POST('/api/admin/calls/{call_id}/form/reject', { ...path(callId), body: { reason } })),
    onSuccess: (form) => writeForm(qc, callId, form),
  })
}

export function useAcknowledgeFlag(callId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (flagId: string) =>
      handle(
        qc,
        await api.POST('/api/admin/calls/{call_id}/flags/{flag_id}/acknowledge', {
          params: { path: { call_id: callId, flag_id: flagId } },
          body: {},
        }),
      ),
    onSuccess: (flag) => {
      qc.setQueryData<CallDetail>(adminKeys.callDetail(callId), (old) =>
        old
          ? {
              ...old,
              timeline: old.timeline.map((e) =>
                e.entry_type === 'flag' && e.id === flag.id ? { ...flag, entry_type: 'flag' as const } : e,
              ),
            }
          : old,
      )
      void invalidateLists(qc)
    },
  })
}

/** Acknowledge a follow-up by call id; the row leaves the follow-up list cache. */
export function useAcknowledgeFollowUp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (callId: string) =>
      handle(qc, await api.POST('/api/admin/calls/{call_id}/follow-up/acknowledge', { ...path(callId), body: {} })),
    onSuccess: (ack) => {
      qc.setQueryData<FollowUpResponse>(adminKeys.followUp(), (old) =>
        old ? { ...old, items: old.items.filter((i) => i.call_id !== ack.call_id) } : old,
      )
    },
  })
}

/** Runs an export batch and returns it (rows + csv); the pending list is refetched. */
export function useExport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => handle(qc, await api.POST('/api/admin/exports', { body: {} })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.exportsPending() })
      void qc.invalidateQueries({ queryKey: ['admin', 'calls'] })
    },
  })
}

/** The voice mode for new calls (admin only). */
export function useVoiceMode() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: adminKeys.voiceMode(),
    queryFn: async () => handle(qc, await api.GET('/api/admin/settings/voice-mode')),
  })
}

/** Saves the voice mode for new calls; calls in progress keep theirs. */
export function useSetVoiceMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (mode: VoiceMode) =>
      handle(qc, await api.POST('/api/admin/settings/voice-mode', { body: { mode } })),
    onSuccess: (data) => {
      qc.setQueryData(adminKeys.voiceMode(), data)
    },
  })
}
