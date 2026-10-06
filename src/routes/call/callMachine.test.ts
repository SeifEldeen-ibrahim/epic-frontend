import { describe, expect, it } from 'vitest'
import {
  CALL_STATES,
  callReducer,
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
}

describe('callReducer', () => {
  it('has exactly the 8 talking-demo states', () => {
    expect(CALL_STATES).toEqual([
      'idle', 'requesting_mic', 'mic_denied', 'unsupported',
      'connecting', 'on_call', 'ended', 'unavailable',
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
