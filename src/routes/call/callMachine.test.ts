import { describe, expect, it } from 'vitest'
import {
  CALL_STATES,
  callReducer,
  classifySignal,
  detectUnsupported,
  formatElapsed,
  INITIAL_CALL_STATE,
  type CallEvent,
  type CallState,
  type CallStateKey,
} from './callMachine'

const EVENTS: CallEvent[] = [
  { type: 'START' },
  { type: 'MIC_GRANTED' },
  { type: 'MIC_DENIED' },
  { type: 'UNSUPPORTED', reason: 'no_webrtc' },
  { type: 'CONNECTED', at: 1000 },
  { type: 'AUDIO_BLOCKED' },
  { type: 'AUDIO_UNBLOCKED' },
  { type: 'UNAVAILABLE' },
  { type: 'ENDED' },
  { type: 'RESET' },
  { type: 'CRISIS' },
  { type: 'HANDOFF', title: 'Residential & Day Programs' },
  { type: 'HUMAN_NEEDED' },
]

// Every legal transition: [from, event type] -> to. Everything else must be ignored.
const LEGAL: Record<string, CallStateKey> = {
  'idle:START': 'requesting_mic',
  'idle:UNSUPPORTED': 'unsupported',
  'requesting_mic:MIC_GRANTED': 'connecting',
  'requesting_mic:MIC_DENIED': 'mic_denied',
  'requesting_mic:UNAVAILABLE': 'unavailable',
  'connecting:CONNECTED': 'on_call',
  'connecting:UNAVAILABLE': 'unavailable',
  'connecting:ENDED': 'ended',
  'on_call:ENDED': 'ended',
  'on_call:UNAVAILABLE': 'unavailable',
  'on_call:AUDIO_BLOCKED': 'on_call',
  'on_call:AUDIO_UNBLOCKED': 'on_call',
  'ended:RESET': 'idle',
  'unavailable:RESET': 'idle',
  // switchboard stop states: crisis always wins once a call exists and is final
  'connecting:CRISIS': 'crisis',
  'on_call:CRISIS': 'crisis',
  'ended:CRISIS': 'crisis',
  'unavailable:CRISIS': 'crisis',
  'handoff:CRISIS': 'crisis',
  'human_needed:CRISIS': 'crisis',
  'on_call:HANDOFF': 'handoff',
  'on_call:HUMAN_NEEDED': 'human_needed',
  'ended:HANDOFF': 'handoff',
  'ended:HUMAN_NEEDED': 'human_needed',
  'handoff:RESET': 'idle',
  'human_needed:RESET': 'idle',
  // voice reconnect: the call goes on; every stop signal still applies, crisis wins
  'reconnecting:CONNECTED': 'on_call',
  'reconnecting:AUDIO_BLOCKED': 'reconnecting',
  'reconnecting:UNAVAILABLE': 'unavailable',
  'reconnecting:ENDED': 'ended',
  'reconnecting:CRISIS': 'crisis',
  'reconnecting:HANDOFF': 'handoff',
  'reconnecting:HUMAN_NEEDED': 'human_needed',
}

describe('callReducer', () => {
  it('has the 8 talking-demo states plus the 3 switchboard stop states', () => {
    expect(CALL_STATES).toEqual([
      'idle', 'requesting_mic', 'mic_denied', 'unsupported',
      'connecting', 'on_call', 'reconnecting', 'ended', 'unavailable',
      'crisis', 'handoff', 'human_needed',
    ])
    expect(INITIAL_CALL_STATE).toEqual({ key: 'idle' })
  })

  for (const from of CALL_STATES) {
    for (const event of EVENTS) {
      const legal = LEGAL[`${from}:${event.type}`]
      it(`${from} + ${event.type} -> ${legal ?? '(ignored)'}`, () => {
        const state: CallState = from === 'on_call' ? { key: from, startedAt: 5 } : { key: from }
        const next = callReducer(state, event)
        if (legal) expect(next.key).toBe(legal)
        else expect(next).toBe(state)
      })
    }
  }

  it('keeps the connect time and the unsupported reason', () => {
    expect(callReducer({ key: 'connecting' }, { type: 'CONNECTED', at: 42 })).toEqual({
      key: 'on_call',
      startedAt: 42,
    })
    expect(callReducer(INITIAL_CALL_STATE, { type: 'UNSUPPORTED', reason: 'insecure' })).toEqual({
      key: 'unsupported',
      unsupportedReason: 'insecure',
    })
    const blocked = callReducer({ key: 'on_call', startedAt: 1 }, { type: 'AUDIO_BLOCKED' })
    expect(blocked.audioBlocked).toBe(true)
  })
})

describe('detectUnsupported', () => {
  const nav = (gum: unknown) => ({ mediaDevices: { getUserMedia: gum } })
  it('reports an insecure page first', () => {
    const win = { isSecureContext: false, RTCPeerConnection: class {}, navigator: nav(() => 0) }
    expect(detectUnsupported(win as unknown as Window)).toBe('insecure')
  })
  it('reports missing WebRTC or microphone API', () => {
    expect(detectUnsupported({ isSecureContext: true, navigator: nav(() => 0) } as unknown as Window)).toBe(
      'no_webrtc',
    )
    const noMic = { isSecureContext: true, RTCPeerConnection: class {}, navigator: {} }
    expect(detectUnsupported(noMic as unknown as Window)).toBe('no_webrtc')
  })
  it('accepts a capable secure browser', () => {
    const win = { isSecureContext: true, RTCPeerConnection: class {}, navigator: nav(() => 0) }
    expect(detectUnsupported(win as unknown as Window)).toBeNull()
  })
})

describe('formatElapsed', () => {
  it('formats mm:ss', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(83.9)).toBe('01:23')
    expect(formatElapsed(-4)).toBe('00:00')
  })
})

describe('callReducer stop states', () => {
  it('a handoff keeps the server title', () => {
    const next = callReducer({ key: 'on_call', startedAt: 1 }, {
      type: 'HANDOFF',
      title: 'Residential & Day Programs',
    })
    expect(next).toEqual({ key: 'handoff', handoffTitle: 'Residential & Day Programs' })
  })

  it('crisis is final: no RESET, no START', () => {
    const crisis: CallState = { key: 'crisis' }
    expect(callReducer(crisis, { type: 'RESET' })).toBe(crisis)
    expect(callReducer(crisis, { type: 'START' })).toBe(crisis)
  })
})

describe('classifySignal', () => {
  it('maps outcomes to screens', () => {
    expect(classifySignal({ status: 'live', outcome: 'crisis', end_reason: 'crisis' })).toBe('CRISIS')
    expect(classifySignal({ status: 'ended', outcome: null, end_reason: 'crisis' })).toBe('CRISIS')
    expect(classifySignal({ status: 'ended', outcome: 'human_needed' })).toBe('HUMAN_NEEDED')
    for (const outcome of ['department_handoff', 'current_client_handoff', 'routed']) {
      expect(classifySignal({ status: 'ended', outcome, handoff_title: 'Clinic Intake' })).toEqual({
        type: 'HANDOFF',
        title: 'Clinic Intake',
      })
    }
    expect(classifySignal({ status: 'ended', outcome: 'department_handoff' })).toBe('ENDED')
    expect(classifySignal({ status: 'ended', outcome: 'referred' })).toBe('ENDED')
    expect(classifySignal({ status: 'live', outcome: null })).toBeNull()
  })
})

describe('callReducer reconnecting (T-FE-CALL)', () => {
  const onCall: CallState = { key: 'on_call', startedAt: 5 }
  const reconnecting = callReducer(onCall, { type: 'RECONNECTING' })

  it('on_call -> reconnecting -> on_call keeps the call start', () => {
    expect(reconnecting).toEqual({ key: 'reconnecting', startedAt: 5 })
    expect(callReducer(reconnecting, { type: 'RECONNECTED' })).toEqual({ key: 'on_call', startedAt: 5 })
    expect(callReducer(reconnecting, { type: 'CONNECTED', at: 99 })).toEqual({ key: 'on_call', startedAt: 5 })
  })

  it.each([
    [{ type: 'ENDED' }, 'ended'],
    [{ type: 'UNAVAILABLE' }, 'unavailable'],
    [{ type: 'HUMAN_NEEDED' }, 'human_needed'],
    [{ type: 'HANDOFF', title: 'Intake' }, 'handoff'],
    [{ type: 'CRISIS' }, 'crisis'],
  ] as [CallEvent, CallStateKey][])('reconnecting + %o -> %s', (event, key) => {
    expect(callReducer(reconnecting, event).key).toBe(key)
  })

  it('RECONNECTING is only legal from on_call', () => {
    const idle: CallState = { key: 'idle' }
    expect(callReducer(idle, { type: 'RECONNECTING' })).toBe(idle)
  })

  it('carries the language across transitions and clears it on RESET', () => {
    const es = callReducer(onCall, { type: 'LANGUAGE', language: 'es' })
    expect(es.language).toBe('es')
    expect(callReducer(es, { type: 'LANGUAGE', language: 'es' })).toBe(es)
    const ended = callReducer(callReducer(es, { type: 'RECONNECTING' }), { type: 'ENDED' })
    expect(ended).toEqual({ key: 'ended', language: 'es' })
    expect(callReducer(ended, { type: 'CRISIS' })).toEqual({ key: 'crisis', language: 'es' })
    expect(callReducer(ended, { type: 'RESET' })).toEqual({ key: 'idle' })
  })
  it('keeps any language code (Lang is a code string), e.g. ar, until RESET', () => {
    const ar = callReducer(onCall, { type: 'LANGUAGE', language: 'ar' })
    expect(ar.language).toBe('ar')
    const ended = callReducer(ar, { type: 'ENDED' })
    expect(ended).toEqual({ key: 'ended', language: 'ar' })
    expect(callReducer(ended, { type: 'HUMAN_NEEDED' })).toEqual({ key: 'human_needed', language: 'ar' })
  })
})
