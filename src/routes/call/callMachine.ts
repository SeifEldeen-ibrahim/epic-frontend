/** The caller page's state machine (talking-demo 8 states + switchboard stop states). Pure. */

export const CALL_STATES = [
  'idle',
  'requesting_mic',
  'mic_denied',
  'unsupported',
  'connecting',
  'on_call',
  'ended',
  'unavailable',
  'crisis',
  'handoff',
  'human_needed',
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
  /** Department title the caller's request is for (handoff only; title, never a name). */
  handoffTitle?: string
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
  | { type: 'CRISIS' }
  | { type: 'HANDOFF'; title: string }
  | { type: 'HUMAN_NEEDED' }

export const INITIAL_CALL_STATE: CallState = { key: 'idle' }

export function isCallStateKey(value: string | undefined): value is CallStateKey {
  return value !== undefined && (CALL_STATES as readonly string[]).includes(value)
}

/** Illegal events leave the state unchanged (same object). */
export function callReducer(state: CallState, event: CallEvent): CallState {
  // A crisis always wins once a call exists, even after the page already showed an end.
  if (
    event.type === 'CRISIS' &&
    ['connecting', 'on_call', 'ended', 'unavailable', 'handoff', 'human_needed'].includes(state.key)
  ) {
    return { key: 'crisis' }
  }
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
      if (event.type === 'HANDOFF') return { key: 'handoff', handoffTitle: event.title }
      if (event.type === 'HUMAN_NEEDED') return { key: 'human_needed' }
      return state
    case 'ended':
      // A late status can still say what the end was.
      if (event.type === 'HANDOFF') return { key: 'handoff', handoffTitle: event.title }
      if (event.type === 'HUMAN_NEEDED') return { key: 'human_needed' }
      if (event.type === 'RESET') return { key: 'idle' }
      return state
    case 'unavailable':
    case 'handoff':
    case 'human_needed':
      if (event.type === 'RESET') return { key: 'idle' }
      return state
    case 'crisis':
    case 'mic_denied':
    case 'unsupported':
      return state
  }
}

/** What a call status / event means for the page. Title only ever comes from the server. */
export interface CallSignal {
  status: string
  outcome?: string | null
  end_reason?: string | null
  handoff_title?: string | null
}

const HANDOFF_OUTCOMES = ['department_handoff', 'current_client_handoff', 'routed']

export function classifySignal(
  signal: CallSignal,
): 'CRISIS' | 'HUMAN_NEEDED' | { type: 'HANDOFF'; title: string } | 'ENDED' | null {
  if (signal.outcome === 'crisis' || signal.end_reason === 'crisis') return 'CRISIS'
  if (signal.status !== 'ended') return null
  if (signal.outcome === 'human_needed') return 'HUMAN_NEEDED'
  if (signal.outcome && HANDOFF_OUTCOMES.includes(signal.outcome) && signal.handoff_title) {
    return { type: 'HANDOFF', title: signal.handoff_title }
  }
  return 'ENDED'
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
