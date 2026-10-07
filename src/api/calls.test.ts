import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { answerSession, createCall, endCall, endCallOnUnload, getCall } from './calls'
import { api } from './client'

vi.mock('./client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))

const POST = vi.mocked(api.POST) as unknown as ReturnType<typeof vi.fn>
const GET = vi.mocked(api.GET) as unknown as ReturnType<typeof vi.fn>

function reply(status: number, body: object) {
  const ok = status >= 200 && status < 300
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status } }
}

const STARTED = { call_id: 'c1', call_secret: 's3cret', sdp_answer: 'v=0 a', max_call_seconds: 1200 }

describe('call API wrappers', () => {
  beforeEach(() => {
    POST.mockReset()
    GET.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('maps 201 to a started call and sends the tester tag', async () => {
    POST.mockResolvedValue(reply(201, STARTED))
    const result = await createCall('v=0 offer', 't07')
    expect(result).toEqual({
      ok: true,
      call: { callId: 'c1', secret: 's3cret', sdpAnswer: 'v=0 a', maxCallSeconds: 1200 },
    })
    expect(POST).toHaveBeenCalledWith('/api/calls', { body: { sdp: 'v=0 offer', tester: 't07' } })
  })

  it.each([
    [503, { reason: 'capacity' }],
    [503, { reason: 'unavailable' }],
    [429, {}],
    [422, { detail: [] }],
    [400, {}],
  ])('maps HTTP %i to unavailable', async (status, body) => {
    POST.mockResolvedValue(reply(status, body))
    expect(await createCall('v=0')).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('maps a network error to unavailable', async () => {
    POST.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await createCall('v=0')).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('sends the secret in the X-Call-Secret header for get and end', async () => {
    const state = { status: 'ended', outcome: 'abandoned', end_reason: 'hangup' }
    GET.mockResolvedValue(reply(200, state))
    POST.mockResolvedValue(reply(200, state))
    expect(await getCall('c1', 's3cret')).toEqual(state)
    expect(await endCall('c1', 's3cret')).toEqual(state)
    const expected = { params: { path: { call_id: 'c1' } }, headers: { 'X-Call-Secret': 's3cret' } }
    expect(GET).toHaveBeenCalledWith('/api/calls/{call_id}', expected)
    expect(POST).toHaveBeenCalledWith('/api/calls/{call_id}/end', expected)
  })

  it('returns null when the call cannot be read', async () => {
    GET.mockResolvedValue(reply(404, { detail: 'Not Found' }))
    expect(await getCall('c1', 'bad')).toBeNull()
  })

  it('ends on unload with a keepalive fetch carrying the header', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)))
    vi.stubGlobal('fetch', fetchMock)
    endCallOnUnload('c1', 's3cret')
    expect(fetchMock).toHaveBeenCalledWith('/api/calls/c1/end', {
      method: 'POST',
      keepalive: true,
      headers: { 'X-Call-Secret': 's3cret' },
    })
  })
})

describe('answerSession', () => {
  beforeEach(() => {
    POST.mockReset()
  })

  it('maps 200 to the answer and posts offer, seq, secret and signal', async () => {
    POST.mockResolvedValue(reply(200, { sdp_answer: 'v=0 clinic', session_seq: 2 }))
    const signal = new AbortController().signal
    expect(await answerSession('c1', 's3cret', 'v=0 offer', 2, signal)).toEqual({
      kind: 'ok',
      sdp: 'v=0 clinic',
      seq: 2,
    })
    expect(POST).toHaveBeenCalledWith('/api/calls/{call_id}/sessions', {
      params: { path: { call_id: 'c1' } },
      headers: { 'X-Call-Secret': 's3cret' },
      body: { sdp: 'v=0 offer', session_seq: 2 },
      signal,
    })
  })

  it.each([
    [404, 'gone'],
    [409, 'conflict'],
    [503, 'unavailable'],
    [422, 'unavailable'],
    [500, 'unavailable'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    POST.mockResolvedValue(reply(status, {}))
    expect(await answerSession('c1', 's', 'o', 2)).toEqual({ kind })
  })

  it('maps a network failure or abort to unavailable', async () => {
    POST.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await answerSession('c1', 's', 'o', 2)).toEqual({ kind: 'unavailable' })
  })
})
