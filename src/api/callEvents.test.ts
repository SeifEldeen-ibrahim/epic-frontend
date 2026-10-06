import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSse, streamCallEvents, type CallEvent } from './callEvents'

const LIVE = { type: 'state', status: 'live', outcome: null, end_reason: null, language: null }
const ENDED = { ...LIVE, status: 'ended', outcome: 'abandoned', end_reason: 'hangup' }
const msg = (event: object) => `event: call\ndata: ${JSON.stringify(event)}\n\n`

function streamOf(chunks: string[], { hold = false } = {}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)))
      if (!hold) controller.close()
    },
  })
}

function stubFetch(body: ReadableStream<Uint8Array> | null, init: ResponseInit = {}) {
  const fetchMock = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(
    async () =>
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        ...init,
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('parseSse', () => {
  it('handles split chunks, several messages, CRLF, comments and unknown events', () => {
    const first = parseSse('event: call\r\ndata: {"a":1}\r\n\r\n: ping\n\nevent: ot')
    expect(first.messages).toEqual([{ event: 'call', data: '{"a":1}' }])
    expect(first.rest).toBe('event: ot')
    const second = parseSse(first.rest + 'her\ndata: x\n\nevent: call\ndata: {"b":2}\n\n')
    expect(second.messages).toEqual([
      { event: 'other', data: 'x' },
      { event: 'call', data: '{"b":2}' },
    ])
    expect(second.rest).toBe('')
  })
})

describe('streamCallEvents', () => {
  it('sends the secret header, delivers events and stops at ended', async () => {
    const half = msg(LIVE)
    const fetchMock = stubFetch(
      streamOf([half.slice(0, 10), half.slice(10) + ': ping\n\n', msg(ENDED)], { hold: true }),
    )
    const seen: CallEvent[] = []
    const end = await streamCallEvents('c/1', 's3cret', (e) => seen.push(e), new AbortController().signal)
    expect(end).toBe('ended')
    expect(seen.map((e) => e.status)).toEqual(['live', 'ended'])
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/calls/c%2F1/events')
    expect(options.headers).toEqual({ 'X-Call-Secret': 's3cret', Accept: 'text/event-stream' })
  })

  it('a stream that closes without ended is dropped', async () => {
    stubFetch(streamOf([msg(LIVE)]))
    expect(await streamCallEvents('c1', 's', () => undefined, new AbortController().signal)).toBe(
      'dropped',
    )
  })

  it('a non-200 or wrong content type is dropped', async () => {
    stubFetch(streamOf([]), { status: 404 })
    expect(await streamCallEvents('c1', 's', () => undefined, new AbortController().signal)).toBe(
      'dropped',
    )
    stubFetch(streamOf([]), { headers: { 'content-type': 'application/json' } })
    expect(await streamCallEvents('c1', 's', () => undefined, new AbortController().signal)).toBe(
      'dropped',
    )
  })

  it('a network error is dropped', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    expect(await streamCallEvents('c1', 's', () => undefined, new AbortController().signal)).toBe(
      'dropped',
    )
  })

  it('a quiet connection trips the watchdog', async () => {
    stubFetch(streamOf([msg(LIVE)], { hold: true }))
    const end = await streamCallEvents('c1', 's', () => undefined, new AbortController().signal, 50)
    expect(end).toBe('dropped')
  })

  it('abort stops reading and is not a failure', async () => {
    stubFetch(streamOf([msg(LIVE)], { hold: true }))
    const controller = new AbortController()
    const pending = streamCallEvents('c1', 's', () => undefined, controller.signal)
    await new Promise((r) => setTimeout(r, 10))
    controller.abort()
    expect(await pending).toBe('aborted')
  })
})
