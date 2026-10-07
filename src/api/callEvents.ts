import type { components } from './schema'

/** One `event: call` message of `GET /api/calls/{id}/events`: a call-state change or a
 * session swap (the browser must renegotiate; it never ends the stream). */
export type CallEvent = components['schemas']['CallEvent']
export type CallStateEvent = components['schemas']['CallStateEvent']
export type CallSessionSwapEvent = components['schemas']['CallSessionSwapEvent']

/** How one stream connection ended. */
export type StreamEnd = 'ended' | 'dropped' | 'aborted'

/** Three missed 15 s heartbeats: the connection is treated as dead. */
export const WATCHDOG_MS = 45_000

const SECRET_HEADER = 'X-Call-Secret'

export interface SseMessage {
  event: string
  data: string
}

/** Splits complete SSE messages off the front of `buffer`; returns them and the unfinished rest. */
export function parseSse(buffer: string): { messages: SseMessage[]; rest: string } {
  const normalized = buffer.replace(/\r\n?/g, '\n')
  const blocks = normalized.split('\n\n')
  const rest = blocks.pop() ?? ''
  const messages: SseMessage[] = []
  for (const block of blocks) {
    let event = 'message'
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (line === '' || line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon < 0 ? line : line.slice(0, colon)
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
    }
    if (data.length) messages.push({ event, data: data.join('\n') })
  }
  return { messages, rest }
}

/**
 * Reads the call-state stream until the call ends ('ended'), the connection fails or goes quiet
 * for `watchdogMs` ('dropped'), or `signal` aborts ('aborted'). Uses fetch, not EventSource, so
 * the per-call secret stays in a header and never in a URL.
 */
export async function streamCallEvents(
  callId: string,
  secret: string,
  onEvent: (event: CallEvent) => void,
  signal: AbortSignal,
  watchdogMs: number = WATCHDOG_MS,
): Promise<StreamEnd> {
  const inner = new AbortController()
  const forward = () => inner.abort()
  signal.addEventListener('abort', forward)
  let watchdog: number | undefined
  const arm = () => {
    window.clearTimeout(watchdog)
    watchdog = window.setTimeout(() => inner.abort(), watchdogMs)
  }
  try {
    if (signal.aborted) return 'aborted'
    arm()
    const response = await fetch(`/api/calls/${encodeURIComponent(callId)}/events`, {
      headers: { [SECRET_HEADER]: secret, Accept: 'text/event-stream' },
      cache: 'no-store',
      signal: inner.signal,
    })
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !type.startsWith('text/event-stream') || !response.body) return 'dropped'
    const reader = response.body.getReader()
    // Unblock a pending read on abort or watchdog, whatever the fetch implementation does.
    inner.signal.addEventListener('abort', () => void reader.cancel().catch(() => undefined))
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return signal.aborted ? 'aborted' : 'dropped'
      arm()
      buffer += decoder.decode(value, { stream: true })
      const parsed = parseSse(buffer)
      buffer = parsed.rest
      for (const message of parsed.messages) {
        if (message.event !== 'call') continue
        let event: CallEvent
        try {
          event = JSON.parse(message.data) as CallEvent
        } catch {
          continue
        }
        onEvent(event)
        if (event.type !== 'session_swap' && event.status === 'ended') {
          void reader.cancel().catch(() => undefined)
          return 'ended'
        }
      }
    }
  } catch {
    return signal.aborted ? 'aborted' : 'dropped'
  } finally {
    window.clearTimeout(watchdog)
    signal.removeEventListener('abort', forward)
  }
}
