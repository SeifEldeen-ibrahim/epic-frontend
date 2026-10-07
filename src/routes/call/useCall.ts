import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { streamCallEvents } from '../../api/callEvents'
import { answerSession, createCall, endCall, endCallOnUnload, getCall, type CallStatus } from '../../api/calls'
import {
  callReducer,
  classifySignal,
  detectUnsupported,
  INITIAL_CALL_STATE,
  type CallSignal,
  type CallState,
} from './callMachine'

export const CONNECT_TIMEOUT_MS = 15_000
/** Call-state stream: reconnect delay, how long a stream must stay open to reset the failure
 * count, and how many consecutive failures end the call safely. */
export const RECONNECT_MS = 1_000
export const STABLE_STREAM_MS = 30_000
export const MAX_STREAM_FAILURES = 3
/** While the call-state stream is not healthy (no event yet on this connection), the status is
 * polled this often: the WebRTC peer stays connected after a server close, so a missed crisis
 * event would otherwise go unseen. */
export const STATUS_POLL_MS = 3_000
/** A session swap (switchboard to clinic voice) must be answered within this time. */
export const SWAP_DEADLINE_MS = 15_000
/** A failed peer while the server says live: re-check once after this before hanging up. */
const RECOVER_GRACE_MS = 3_000

const TESTER_RE = /^[A-Za-z0-9 _.-]{1,40}$/

export function sanitizeTester(raw: string | null): string | undefined {
  const value = raw?.trim()
  return value && TESTER_RE.test(value) ? value : undefined
}

interface LiveCall {
  active: boolean
  pc?: RTCPeerConnection
  stream?: MediaStream
  callId?: string
  secret?: string
  audioBlocked?: boolean
  eventsAbort?: AbortController
  failures: number
  timers: number[]
  /** An event arrived on the current stream connection. */
  healthy?: boolean
  /** The last call-state event (status, outcome, title). */
  last?: CallSignal
  /** Crisis: nothing may play audio again on this call. */
  crisis?: boolean
  /** The voice session the current peer belongs to (1 = the first session). */
  appliedSeq: number
  /** The highest session_seq a swap was attempted for: a failed seq is not retried. */
  attemptedSeq: number
  /** A swap in progress: the pending peer, its answer request and its deadline. */
  swapping?: Swap
}

interface Swap {
  seq: number
  pc: RTCPeerConnection
  abort: AbortController
  timer: number
}

const idleLive = (): LiveCall => ({
  active: false,
  failures: 0,
  timers: [],
  appliedSeq: 1,
  attemptedSeq: 1,
})

function dropPeer(pc: RTCPeerConnection) {
  pc.ontrack = null
  pc.onconnectionstatechange = null
  pc.close()
}

function initialState(): CallState {
  const reason = detectUnsupported()
  return reason ? { key: 'unsupported', unsupportedReason: reason } : INITIAL_CALL_STATE
}

function micDenied(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name
  return name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError'
}

/**
 * The call: microphone, WebRTC to GPT-Live (offer/answer through our backend, no data channel),
 * the call-state stream (SSE over fetch) for a server-side end, End call, and a keepalive end
 * when the page is hidden.
 * Everything starts from the Call click, never from an effect (StrictMode-safe).
 */
export function useCall(tester?: string) {
  const [state, dispatch] = useReducer(callReducer, undefined, initialState)
  const [now, setNow] = useState(() => Date.now())
  const audioRef = useRef<HTMLAudioElement>(null)
  const live = useRef<LiveCall>(idleLive())
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  })

  const teardown = useCallback(() => {
    const l = live.current
    l.timers.forEach((t) => window.clearTimeout(t))
    l.eventsAbort?.abort()
    if (l.swapping) {
      window.clearTimeout(l.swapping.timer)
      l.swapping.abort.abort()
      l.swapping.pc.close()
      l.swapping = undefined
    }
    l.stream?.getTracks().forEach((track) => track.stop())
    l.pc?.close()
    const audio = audioRef.current
    if (audio) {
      audio.muted = true
      audio.srcObject = null
    }
    live.current = idleLive()
  }, [])

  /** Crisis: silence the agent first (synchronously), then end everything on this page. */
  const enterCrisis = useCallback(
    (l: LiveCall) => {
      l.crisis = true
      const audio = audioRef.current
      if (audio) {
        audio.muted = true
        audio.pause()
        audio.srcObject = null
      }
      if (live.current === l) teardown()
      dispatch({ type: 'CRISIS' })
    },
    [teardown],
  )

  /** One classifier for every path that learns how the call stands (stream, status, drop). */
  const apply = useCallback(
    (l: LiveCall, signal: CallSignal | null | undefined): boolean => {
      if (!signal) return false
      const verdict = classifySignal(signal)
      if (verdict === 'CRISIS') {
        enterCrisis(l)
        return true
      }
      if (verdict === null || live.current !== l) return false
      const onCall = stateRef.current.key === 'on_call'
      teardown()
      if (!onCall) dispatch({ type: 'UNAVAILABLE' })
      else if (verdict === 'ENDED') dispatch({ type: 'ENDED' })
      else if (verdict === 'HUMAN_NEEDED') dispatch({ type: 'HUMAN_NEEDED' })
      else dispatch(verdict)
      return true
    },
    [enterCrisis, teardown],
  )

  const hangup = useCallback(
    async (to: 'ENDED' | 'UNAVAILABLE') => {
      const l = live.current
      if (!l.active) return
      teardown()
      dispatch({ type: to })
      if (l.callId && l.secret) await endCall(l.callId, l.secret)
    },
    [teardown],
  )

  const serverEnded = useCallback(
    (l: LiveCall, signal?: CallSignal | null) => {
      if (live.current !== l) return
      if (apply(l, signal ?? l.last ?? { status: 'ended' })) return
      apply(l, { status: 'ended' })
    },
    [apply],
  )

  /** Set after render: a swap is started from status checks declared before it. */
  const swapRef = useRef<(l: LiveCall, seq: number) => void>(() => undefined)

  /** Applies a status; a live call with a pending session swap starts (or keeps) that swap.
   * Returns true when the status was handled (ended, crisis, or a pending swap). */
  const learn = useCallback(
    (l: LiveCall, status: CallStatus): boolean => {
      if (apply(l, status)) return true
      if (status.status === 'live' && status.pending_session_seq != null) {
        swapRef.current(l, status.pending_session_seq)
        return true
      }
      return false
    },
    [apply],
  )

  const check = useCallback(async () => {
    const l = live.current
    if (!l.callId || !l.secret) return
    const status = await getCall(l.callId, l.secret)
    if (live.current !== l || !status) return
    learn(l, status)
  }, [learn])

  /** The current peer failed or disconnected: ask the server before ending anything (the
   * switchboard session is hung up on purpose during a bridge). */
  const recover = useCallback(
    async (l: LiveCall, pc: RTCPeerConnection, failed: boolean) => {
      for (let attempt = 0; ; attempt += 1) {
        const status = l.callId && l.secret ? await getCall(l.callId, l.secret) : null
        if (live.current !== l || l.pc !== pc) return
        if (status && learn(l, status)) return
        if (l.swapping || !failed) return
        if (status?.status !== 'live' || attempt > 0) break
        // The server may have hung the switchboard up just before announcing the swap: ask
        // once more before treating the dead peer as a dropped call.
        await new Promise<void>((resolve) => {
          l.timers.push(window.setTimeout(resolve, RECOVER_GRACE_MS))
        })
        if (live.current !== l) return
      }
      void hangup(stateRef.current.key === 'on_call' ? 'ENDED' : 'UNAVAILABLE')
    },
    [hangup, learn],
  )

  /** Handlers for a peer; each acts only while its peer is the current or the pending one. */
  const wirePeer = useCallback(
    (l: LiveCall, pc: RTCPeerConnection) => {
      const owns = () => live.current === l && (l.pc === pc || l.swapping?.pc === pc)
      pc.ontrack = (event) => {
        const audio = audioRef.current
        if (!audio || !owns() || l.crisis) return
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track])
        audio.play().catch(() => {
          l.audioBlocked = true
          if (stateRef.current.key === 'on_call') dispatch({ type: 'AUDIO_BLOCKED' })
        })
      }
      pc.onconnectionstatechange = () => {
        if (!owns()) return
        const state = pc.connectionState
        if (state === 'connected') {
          if (stateRef.current.key !== 'on_call') dispatch({ type: 'CONNECTED', at: Date.now() })
          if (l.audioBlocked) dispatch({ type: 'AUDIO_BLOCKED' })
        } else if (l.pc === pc && (state === 'failed' || state === 'disconnected')) {
          void recover(l, pc, state === 'failed')
        }
      }
    },
    [recover],
  )

  /** Moves the call to a new voice session: a second peer with the same mic tracks, a new
   * offer/answer, then the old peer is dropped. Failure never ends a live call here. */
  const beginSwap = useCallback(
    (l: LiveCall, seq: number) => {
      const { callId, secret, stream } = l
      if (live.current !== l || !l.active || l.crisis || l.swapping) return
      if (seq <= l.appliedSeq || seq <= l.attemptedSeq || !callId || !secret || !stream) return
      l.attemptedSeq = seq
      const pc = new RTCPeerConnection()
      const swap: Swap = { seq, pc, abort: new AbortController(), timer: 0 }
      const fail = () => {
        if (l.swapping !== swap) return
        window.clearTimeout(swap.timer)
        swap.abort.abort()
        dropPeer(pc)
        l.swapping = undefined
        if (live.current === l) void check()
      }
      swap.timer = window.setTimeout(fail, SWAP_DEADLINE_MS)
      l.swapping = swap
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      wirePeer(l, pc)
      void (async () => {
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          if (l.swapping !== swap) return
          const sdp = pc.localDescription?.sdp ?? offer.sdp ?? ''
          const result = await answerSession(callId, secret, sdp, seq, swap.abort.signal)
          if (live.current !== l || l.swapping !== swap) return
          if (result.kind === 'gone') {
            serverEnded(l, { status: 'ended' })
            return
          }
          if (result.kind !== 'ok') {
            fail()
            return
          }
          await pc.setRemoteDescription({ type: 'answer', sdp: result.sdp })
          if (live.current !== l || l.swapping !== swap) return
          window.clearTimeout(swap.timer)
          if (l.pc) dropPeer(l.pc)
          l.pc = pc
          l.appliedSeq = seq
          l.swapping = undefined
        } catch {
          fail()
        }
      })()
    },
    [check, serverEnded, wirePeer],
  )

  useEffect(() => {
    swapRef.current = beginSwap
  })

  /** Polls the status every STATUS_POLL_MS while the stream has delivered nothing. */
  const poll = useCallback(
    (l: LiveCall) => {
      const tick = () => {
        if (live.current !== l || l.healthy) return
        void check().then(() => {
          if (live.current === l && !l.healthy) l.timers.push(window.setTimeout(tick, STATUS_POLL_MS))
        })
      }
      l.timers.push(window.setTimeout(tick, STATUS_POLL_MS))
    },
    [check],
  )

  /** Follows the call-state stream; on a drop asks for the call, reconnects, and after
   * MAX_STREAM_FAILURES consecutive failures ends the call safely. A session_swap event starts a
   * swap and is never stored as the call state. */
  const listen = useCallback(
    async (l: LiveCall) => {
      const callId = l.callId
      const secret = l.secret
      if (!callId || !secret) return
      while (live.current === l) {
        const controller = new AbortController()
        l.eventsAbort = controller
        const opened = Date.now()
        l.healthy = false
        poll(l)
        const end = await streamCallEvents(
          callId,
          secret,
          (event) => {
            if (live.current !== l) return
            l.healthy = true
            if (event.type === 'session_swap') {
              beginSwap(l, event.session_seq)
              return
            }
            l.last = event
            if (classifySignal(event) === 'CRISIS') enterCrisis(l)
          },
          controller.signal,
        )
        if (live.current !== l || end === 'aborted') return
        if (end === 'ended') {
          serverEnded(l)
          return
        }
        l.healthy = false
        if (Date.now() - opened >= STABLE_STREAM_MS) l.failures = 0
        l.failures += 1
        const status = await getCall(callId, secret)
        if (live.current !== l) return
        if (status && learn(l, status)) return
        if (status === null) l.failures += 1
        if (l.failures >= MAX_STREAM_FAILURES) {
          void hangup(stateRef.current.key === 'on_call' ? 'ENDED' : 'UNAVAILABLE')
          return
        }
        await new Promise<void>((resolve) => {
          l.timers.push(window.setTimeout(resolve, RECONNECT_MS))
        })
      }
    },
    [beginSwap, enterCrisis, hangup, learn, poll, serverEnded],
  )

  const start = useCallback(async () => {
    if (live.current.active) return
    const l: LiveCall = { active: true, failures: 0, timers: [], appliedSeq: 1, attemptedSeq: 1 }
    live.current = l
    // A new call may play audio again (a crisis or teardown muted the shared element).
    if (audioRef.current) audioRef.current.muted = false
    dispatch({ type: 'START' })

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (error) {
      if (live.current === l) live.current = idleLive()
      dispatch({ type: micDenied(error) ? 'MIC_DENIED' : 'UNAVAILABLE' })
      return
    }
    if (live.current !== l) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    l.stream = stream
    dispatch({ type: 'MIC_GRANTED' })

    try {
      const pc = new RTCPeerConnection()
      l.pc = pc
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      wirePeer(l, pc)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const result = await createCall(pc.localDescription?.sdp ?? offer.sdp ?? '', tester)
      if (live.current !== l) {
        // Ended while connecting: make sure a call created meanwhile does not stay open.
        if (result.ok) endCallOnUnload(result.call.callId, result.call.secret)
        return
      }
      if (!result.ok) {
        teardown()
        dispatch({ type: 'UNAVAILABLE' })
        return
      }
      l.callId = result.call.callId
      l.secret = result.call.secret
      await pc.setRemoteDescription({ type: 'answer', sdp: result.call.sdpAnswer })
      void listen(l)
      l.timers.push(
        window.setTimeout(() => {
          if (live.current === l && stateRef.current.key === 'connecting') void hangup('UNAVAILABLE')
        }, CONNECT_TIMEOUT_MS),
      )
    } catch {
      if (live.current === l) void hangup('UNAVAILABLE')
    }
  }, [hangup, listen, teardown, tester, wirePeer])

  const end = useCallback(() => void hangup('ENDED'), [hangup])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])
  const unlockAudio = useCallback(() => {
    const l = live.current
    if (l.crisis || stateRef.current.key === 'crisis') return
    audioRef.current
      ?.play()
      .then(() => {
        l.audioBlocked = false
        dispatch({ type: 'AUDIO_UNBLOCKED' })
      })
      .catch(() => undefined)
  }, [])

  // Tab closed or navigated away: end the call with a keepalive request.
  useEffect(() => {
    const onHide = () => {
      const l = live.current
      if (l.callId && l.secret) endCallOnUnload(l.callId, l.secret)
      if (l.active) teardown()
    }
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      onHide()
    }
  }, [teardown])

  // Call timer (only while on call).
  useEffect(() => {
    if (state.key !== 'on_call') return
    const id = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(id)
  }, [state.key])

  const elapsedSeconds =
    state.key === 'on_call' && state.startedAt ? Math.max(0, (now - state.startedAt) / 1000) : 0

  return { state, elapsedSeconds, start, end, reset, unlockAudio, audioRef }
}
