/** The caller page's state machine (talking-demo scope: 8 states). Pure, no side effects. */

export const CALL_STATES = [
  'idle',
  'requesting_mic',
  'mic_denied',
  'unsupported',
  'connecting',
  'on_call',
  'ended',
  'unavailable',
] as const

export type CallStateKey = (typeof CALL_STATES)[number]
export type UnsupportedReason = 'no_webrtc' | 'insecure'

export interface CallState {
  key: CallStateKey
  unsupportedReason?: UnsupportedReason
  /** ms timestamp when the call connected (on_call only). */
  startedAt?: number
  /** The browser refused to autoplay the agent's audio; show "Tap to hear the agent". */
  audioBlocked?: boolean
}

export type CallEvent =
  | { type: 'START' }
  | { type: 'MIC_GRANTED' }
  | { type: 'MIC_DENIED' }
  | { type: 'UNSUPPORTED'; reason: UnsupportedReason }
  | { type: 'CONNECTED'; at: number }
  | { type: 'AUDIO_BLOCKED' }
  | { type: 'AUDIO_UNBLOCKED' }
  | { type: 'UNAVAILABLE' }
  | { type: 'ENDED' }
  | { type: 'RESET' }

export const INITIAL_CALL_STATE: CallState = { key: 'idle' }

export function isCallStateKey(value: string | undefined): value is CallStateKey {
  return value !== undefined && (CALL_STATES as readonly string[]).includes(value)
}

/** Illegal events leave the state unchanged (same object). */
export function callReducer(state: CallState, event: CallEvent): CallState {
  switch (state.key) {
    case 'idle':
      if (event.type === 'START') return { key: 'requesting_mic' }
      if (event.type === 'UNSUPPORTED') return { key: 'unsupported', unsupportedReason: event.reason }
      return state
    case 'requesting_mic':
      if (event.type === 'MIC_GRANTED') return { key: 'connecting' }
      if (event.type === 'MIC_DENIED') return { key: 'mic_denied' }
      if (event.type === 'UNAVAILABLE') return { key: 'unavailable' }
      return state
    case 'connecting':
      if (event.type === 'CONNECTED') return { key: 'on_call', startedAt: event.at }
      if (event.type === 'UNAVAILABLE') return { key: 'unavailable' }
      if (event.type === 'ENDED') return { key: 'ended' }
      return state
    case 'on_call':
      if (event.type === 'ENDED') return { key: 'ended' }
      if (event.type === 'UNAVAILABLE') return { key: 'unavailable' }
      if (event.type === 'AUDIO_BLOCKED') return { ...state, audioBlocked: true }
      if (event.type === 'AUDIO_UNBLOCKED') return { ...state, audioBlocked: false }
      return state
    case 'ended':
    case 'unavailable':
      if (event.type === 'RESET') return { key: 'idle' }
      return state
    case 'mic_denied':
    case 'unsupported':
      return state
  }
}

/** Support check done once at start: no WebRTC, or not a secure context (mic needs HTTPS). */
export function detectUnsupported(
  win: Window & { RTCPeerConnection?: unknown } = window,
): UnsupportedReason | null {
  if (win.isSecureContext === false) return 'insecure'
  const hasRtc = typeof win.RTCPeerConnection === 'function'
  const hasMic = typeof win.navigator?.mediaDevices?.getUserMedia === 'function'
  return hasRtc && hasMic ? null : 'no_webrtc'
}

export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}
