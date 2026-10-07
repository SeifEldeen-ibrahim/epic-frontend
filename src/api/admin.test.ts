import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AdminApiError,
  adminKeys,
  useAcknowledgeFlag,
  useAcknowledgeFollowUp,
  useApprove,
  useCallDetail,
  useEditField,
  useExport,
  useQueue,
  useReject,
  useSetVoiceMode,
  useVoiceMode,
  type CallDetail,
} from './admin'
import { fetchSession, sessionQueryKey, useLogout, useSession, type Session } from './auth'
import { api } from './client'
import { createQueryClient } from './queryClient'

vi.mock('./client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))

const GET = vi.mocked(api.GET) as unknown as ReturnType<typeof vi.fn>
const POST = vi.mocked(api.POST) as unknown as ReturnType<typeof vi.fn>

function reply(status: number, body?: object) {
  const ok = status < 400
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status } }
}

const user = { id: 'u1', email: 'a@example.test', display_name: 'A', role: 'admin', must_change_password: false }
const form = { id: 'f1', status: 'approved' }
const flag = { entry_type: 'flag', id: 'fl1', at: 't', status: 'acknowledged' }
const detail = {
  call: { id: 'c1' },
  sessions: [],
  timeline: [
    { entry_type: 'turn', id: 't1' },
    { entry_type: 'flag', id: 'fl1', at: 't', status: 'open' },
  ],
  form: { id: 'f1', status: 'awaiting_approval' },
  field_history: [],
  recording: {},
} as unknown as CallDetail

let qc: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => {
  GET.mockReset()
  POST.mockReset()
  qc = createQueryClient()
})

describe('session', () => {
  it('maps 401 from me to signed-out without throwing', async () => {
    GET.mockResolvedValue(reply(401, { detail: 'not_authenticated' }))
    await expect(fetchSession()).resolves.toEqual({ state: 'signed-out' })
    const { result } = renderHook(() => useSession(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ state: 'signed-out' }))
    expect(result.current.isError).toBe(false)
  })

  it('maps must_change_password and signed-in users', async () => {
    GET.mockResolvedValueOnce(reply(200, { ...user, must_change_password: true }))
    expect((await fetchSession()).state).toBe('must-change')
    GET.mockResolvedValueOnce(reply(200, user))
    expect(await fetchSession()).toEqual({ state: 'signed-in', user })
    expect(GET).toHaveBeenCalledWith('/api/admin/auth/me')
  })

  it('a 403 password_change_required from a data query moves the session to must-change', async () => {
    qc.setQueryData<Session>(sessionQueryKey, { state: 'signed-in', user } as Session)
    GET.mockResolvedValue(reply(403, { detail: 'password_change_required' }))
    const { result } = renderHook(() => useQueue(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as AdminApiError).isPasswordChangeRequired).toBe(true)
    expect(qc.getQueryData<Session>(sessionQueryKey)?.state).toBe('must-change')
  })

  it('logout posts {} and clears the query cache', async () => {
    qc.setQueryData(adminKeys.queue(), { items: [] })
    qc.setQueryData<Session>(sessionQueryKey, { state: 'signed-in', user } as Session)
    POST.mockResolvedValue(reply(204))
    const { result } = renderHook(() => useLogout(), { wrapper })
    await result.current.mutateAsync()
    expect(POST).toHaveBeenCalledWith('/api/admin/auth/logout', { body: {} })
    expect(qc.getQueryData(adminKeys.queue())).toBeUndefined()
    expect(qc.getQueryData(sessionQueryKey)).toEqual({ state: 'signed-out' })
  })
})

describe('global 401', () => {
  it('a 401 from a data query clears the cache and signs out', async () => {
    qc.setQueryData<Session>(sessionQueryKey, { state: 'signed-in', user } as Session)
    qc.setQueryData(adminKeys.callDetail('c1'), detail)
    GET.mockResolvedValue(reply(401, { detail: 'not_authenticated' }))
    const { result } = renderHook(() => useQueue(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(AdminApiError)
    expect(qc.getQueryData(adminKeys.callDetail('c1'))).toBeUndefined()
    expect(qc.getQueryData(sessionQueryKey)).toEqual({ state: 'signed-out' })
  })
})

describe('call detail mutations', () => {
  beforeEach(() => {
    qc.setQueryData(adminKeys.callDetail('c1'), detail)
  })

  async function mountDetail() {
    GET.mockResolvedValue(reply(200, detail))
    const view = renderHook(() => useCallDetail('c1'), { wrapper })
    await waitFor(() => expect(view.result.current.data).toBeDefined())
    GET.mockClear()
    return view
  }

  it('edit field posts the path and body and writes the form without refetching detail', async () => {
    const view = await mountDetail()
    POST.mockResolvedValue(reply(200, form))
    const { result } = renderHook(() => useEditField('c1'), { wrapper })
    await result.current.mutateAsync({ field: 'caller_name', old: 'A', new: 'B' })
    expect(POST).toHaveBeenCalledWith('/api/admin/calls/{call_id}/form/fields', {
      params: { path: { call_id: 'c1' } },
      body: { field: 'caller_name', old: 'A', new: 'B' },
    })
    await waitFor(() => expect(view.result.current.data?.form).toEqual(form))
    expect(GET).not.toHaveBeenCalled()
  })

  it('approve and reject post their bodies and write the returned form', async () => {
    POST.mockResolvedValue(reply(200, form))
    const approve = renderHook(() => useApprove('c1'), { wrapper }).result
    await approve.current.mutateAsync()
    expect(POST).toHaveBeenLastCalledWith('/api/admin/calls/{call_id}/form/approve', {
      params: { path: { call_id: 'c1' } },
      body: {},
    })
    const reject = renderHook(() => useReject('c1'), { wrapper }).result
    await reject.current.mutateAsync('duplicate')
    expect(POST).toHaveBeenLastCalledWith('/api/admin/calls/{call_id}/form/reject', {
      params: { path: { call_id: 'c1' } },
      body: { reason: 'duplicate' },
    })
    expect(qc.getQueryData<CallDetail>(adminKeys.callDetail('c1'))?.form).toEqual(form)
    expect(GET).not.toHaveBeenCalled()
  })

  it('acknowledge flag replaces the timeline entry without refetching', async () => {
    await mountDetail()
    POST.mockResolvedValue(reply(200, flag))
    const { result } = renderHook(() => useAcknowledgeFlag('c1'), { wrapper })
    await result.current.mutateAsync('fl1')
    expect(POST).toHaveBeenCalledWith('/api/admin/calls/{call_id}/flags/{flag_id}/acknowledge', {
      params: { path: { call_id: 'c1', flag_id: 'fl1' } },
      body: {},
    })
    const timeline = qc.getQueryData<CallDetail>(adminKeys.callDetail('c1'))?.timeline
    expect(timeline?.[1]).toEqual(flag)
    expect(timeline?.[0]).toEqual(detail.timeline[0])
    expect(GET).not.toHaveBeenCalled()
  })

  it('a 409 surfaces a typed conflict error', async () => {
    POST.mockResolvedValue(reply(409, { detail: 'form_not_awaiting_approval' }))
    const { result } = renderHook(() => useApprove('c1'), { wrapper })
    const err = await result.current.mutateAsync().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AdminApiError)
    expect((err as AdminApiError).isConflict).toBe(true)
    expect((err as AdminApiError).detail).toBe('form_not_awaiting_approval')
    expect(qc.getQueryData<CallDetail>(adminKeys.callDetail('c1'))?.form).toEqual(detail.form)
  })
})

describe('lists', () => {
  it('acknowledging a follow-up removes the row from the cache', async () => {
    qc.setQueryData(adminKeys.followUp(), { items: [{ call_id: 'c1' }, { call_id: 'c2' }] })
    POST.mockResolvedValue(reply(200, { call_id: 'c1', follow_up_status: 'acknowledged' }))
    const { result } = renderHook(() => useAcknowledgeFollowUp(), { wrapper })
    await result.current.mutateAsync('c1')
    expect(POST).toHaveBeenCalledWith('/api/admin/calls/{call_id}/follow-up/acknowledge', {
      params: { path: { call_id: 'c1' } },
      body: {},
    })
    expect(qc.getQueryData(adminKeys.followUp())).toEqual({ items: [{ call_id: 'c2' }] })
  })

  it('export returns the batch and invalidates the pending list', async () => {
    qc.setQueryData(adminKeys.exportsPending(), { items: [{}] })
    const batch = { exported_at: 'now', count: 1, rows: [{}], csv: 'a,b\n' }
    POST.mockResolvedValue(reply(200, batch))
    const { result } = renderHook(() => useExport(), { wrapper })
    await expect(result.current.mutateAsync()).resolves.toEqual(batch)
    expect(POST).toHaveBeenCalledWith('/api/admin/exports', { body: {} })
    expect(qc.getQueryState(adminKeys.exportsPending())?.isInvalidated).toBe(true)
  })
})

describe('voice mode', () => {
  it('reads the setting and writes the saved one into the cache', async () => {
    GET.mockResolvedValue(reply(200, { mode: 'gpt-live', stored: false, updated_at: null }))
    const read = renderHook(() => useVoiceMode(), { wrapper })
    await waitFor(() => expect(read.result.current.data?.mode).toBe('gpt-live'))
    expect(GET).toHaveBeenCalledWith('/api/admin/settings/voice-mode')
    const saved = { mode: 'realtime', stored: true, updated_at: 'now' }
    POST.mockResolvedValue(reply(200, saved))
    const { result } = renderHook(() => useSetVoiceMode(), { wrapper })
    await expect(result.current.mutateAsync('realtime')).resolves.toEqual(saved)
    expect(POST).toHaveBeenCalledWith('/api/admin/settings/voice-mode', { body: { mode: 'realtime' } })
    expect(qc.getQueryData(adminKeys.voiceMode())).toEqual(saved)
  })

  it('a failed save throws a typed error and leaves the cache alone', async () => {
    qc.setQueryData(adminKeys.voiceMode(), { mode: 'gpt-live', stored: true, updated_at: 'x' })
    POST.mockResolvedValue(reply(503, { detail: 'unavailable' }))
    const { result } = renderHook(() => useSetVoiceMode(), { wrapper })
    await expect(result.current.mutateAsync('realtime')).rejects.toBeInstanceOf(AdminApiError)
    expect(qc.getQueryData(adminKeys.voiceMode())).toEqual({ mode: 'gpt-live', stored: true, updated_at: 'x' })
  })
})
