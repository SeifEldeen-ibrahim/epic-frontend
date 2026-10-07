import { api } from './client'
import type { components } from './schema'

export type CallStatus = components['schemas']['CallStatusResponse']
/** Test-only start options (`?test=` on the caller page). */
export type CallTestOptions = NonNullable<components['schemas']['CreateCallRequest']['test']>

export interface StartedCall {
  callId: string
  secret: string
  sdpAnswer: string
  maxCallSeconds: number
}

/** A refused start (cap reached, voice service down, rate limit, bad request or offline). */
export type CreateCallResult = { ok: true; call: StartedCall } | { ok: false; reason: 'unavailable' }

const SECRET_HEADER = 'X-Call-Secret'

export async function createCall(
  sdp: string,
  tester?: string,
  test?: CallTestOptions,
): Promise<CreateCallResult> {
  try {
    const { data } = await api.POST('/api/calls', {
      body: { sdp, tester: tester ?? null, ...(test ? { test } : {}) },
    })
    if (data) {
      return {
        ok: true,
        call: {
          callId: data.call_id,
          secret: data.call_secret,
          sdpAnswer: data.sdp_answer,
          maxCallSeconds: data.max_call_seconds,
        },
      }
    }
  } catch {
    // network failure: same screen as a refusal
  }
  return { ok: false, reason: 'unavailable' }
}

/** Current state of a call, or null when it cannot be read (unknown call or offline). */
export async function getCall(callId: string, secret: string): Promise<CallStatus | null> {
  try {
    const { data } = await api.GET('/api/calls/{call_id}', {
      params: { path: { call_id: callId } },
      headers: { [SECRET_HEADER]: secret },
    })
    return data ?? null
  } catch {
    return null
  }
}

export async function endCall(callId: string, secret: string): Promise<CallStatus | null> {
  try {
    const { data } = await api.POST('/api/calls/{call_id}/end', {
      params: { path: { call_id: callId } },
      headers: { [SECRET_HEADER]: secret },
    })
    return data ?? null
  } catch {
    return null
  }
}

/** Outcome of answering a session swap: the clinic session's SDP answer, or why not. */
export type AnswerSessionResult =
  | { kind: 'ok'; sdp: string; seq: number }
  | { kind: 'conflict' }
  | { kind: 'unavailable'; network?: boolean }
  | { kind: 'gone' }

/** Posts the new SDP offer for a pending session swap. 404 gone, 409 conflict (no pending swap,
 * wrong seq, already claimed, too late); 503, other errors, network failure and abort are
 * unavailable. */
export async function answerSession(
  callId: string,
  secret: string,
  sdp: string,
  seq: number,
  signal?: AbortSignal,
): Promise<AnswerSessionResult> {
  try {
    const { data, response } = await api.POST('/api/calls/{call_id}/sessions', {
      params: { path: { call_id: callId } },
      headers: { [SECRET_HEADER]: secret },
      body: { sdp, session_seq: seq },
      signal,
    })
    if (data) return { kind: 'ok', sdp: data.sdp_answer, seq: data.session_seq }
    if (response.status === 404) return { kind: 'gone' }
    if (response.status === 409) return { kind: 'conflict' }
  } catch {
    // network failure or abort: no HTTP answer
    return { kind: 'unavailable', network: true }
  }
  return { kind: 'unavailable' }
}

/** Reconnecting the current voice session: the new answer, or why not (status 0: no HTTP
 * answer). 409 reasons: ended, crisis, handoff_pending, in_progress, limit. */
export type ReconnectResult =
  | { ok: true; sdp_answer: string; session_seq: number }
  | { ok: false; status: number; reason?: string }

export async function reconnectCall(
  callId: string,
  secret: string,
  sdp: string,
  signal?: AbortSignal,
): Promise<ReconnectResult> {
  try {
    const { data, error, response } = await api.POST('/api/calls/{call_id}/reconnect', {
      params: { path: { call_id: callId } },
      headers: { [SECRET_HEADER]: secret },
      body: { sdp },
      signal,
    })
    if (data) return { ok: true, sdp_answer: data.sdp_answer, session_seq: data.session_seq }
    const body = error as { reason?: unknown; detail?: { reason?: unknown } } | undefined
    const reason = body?.reason ?? body?.detail?.reason
    return { ok: false, status: response.status, ...(typeof reason === 'string' ? { reason } : {}) }
  } catch {
    return { ok: false, status: 0 }
  }
}

/** Fire-and-forget end that survives the page closing (pagehide). Same header, same path. */
export function endCallOnUnload(callId: string, secret: string): void {
  try {
    void fetch(`/api/calls/${encodeURIComponent(callId)}/end`, {
      method: 'POST',
      keepalive: true,
      headers: { [SECRET_HEADER]: secret },
    }).catch(() => undefined)
  } catch {
    // nothing more can be done while the page unloads
  }
}
