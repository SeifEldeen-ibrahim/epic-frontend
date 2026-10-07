import { api } from './client'
import type { components } from './schema'

export type CallStatus = components['schemas']['CallStatusResponse']

export interface StartedCall {
  callId: string
  secret: string
  sdpAnswer: string
  maxCallSeconds: number
}

/** A refused start (cap reached, voice service down, rate limit, bad request or offline). */
export type CreateCallResult = { ok: true; call: StartedCall } | { ok: false; reason: 'unavailable' }

const SECRET_HEADER = 'X-Call-Secret'

export async function createCall(sdp: string, tester?: string): Promise<CreateCallResult> {
  try {
    const { data } = await api.POST('/api/calls', { body: { sdp, tester: tester ?? null } })
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
  | { kind: 'unavailable' }
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
    // network failure or abort
  }
  return { kind: 'unavailable' }
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
