import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamCallEvents, type CallEvent as CallEventMsg, type StreamEnd } from '../../api/callEvents'
import {
  answerSession,
  createCall,
  endCall,
  endCallOnUnload,
  getCall,
  reconnectCall,
  useScreenText,
  type ReconnectResult,
} from '../../api/calls'
import { COPY, CRISIS, SHIPPED_SCREEN_TEXT } from './copy'
import { CallPage } from './CallPage'
import { MAX_STREAM_FAILURES, RECONNECT_MS, STATUS_POLL_MS, SWAP_DEADLINE_MS } from './useCall'

vi.mock('../../api/calls', () => ({
  answerSession: vi.fn(),
  createCall: vi.fn(),
  endCall: vi.fn(),
  getCall: vi.fn(),
  endCallOnUnload: vi.fn(),
  reconnectCall: vi.fn(),
  useScreenText: vi.fn(),
}))

vi.mock('../../api/callEvents', () => ({ streamCallEvents: vi.fn() }))

const streamMock = vi.mocked(streamCallEvents)
/** Each stream connection waits here until the test resolves it (or the page aborts it). */
let streams: {
  resolve: (end: StreamEnd) => void
  signal: AbortSignal
  onEvent: (event: CallEventMsg) => void
}[] = []

const createCallMock = vi.mocked(createCall)
const endCallMock = vi.mocked(endCall)
const getCallMock = vi.mocked(getCall)
const unloadMock = vi.mocked(endCallOnUnload)
const answerMock = vi.mocked(answerSession)
const reconnectMock = vi.mocked(reconnectCall)
const screenTextMock = vi.mocked(useScreenText)

class FakePC {
  static instances: FakePC[] = []
  /** When set, applying the answer fires ontrack with this peer's remote stream. */
  static trackOnAnswer = false
  remote = { id: `remote-${FakePC.instances.length}` }
  connectionState = 'new'
  localDescription: { type: string; sdp: string } | null = null
  ontrack: ((event: unknown) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  addTrack = vi.fn()
  createDataChannel = vi.fn()
  close = vi.fn()
  setRemoteDescription = vi.fn(async () => {
    if (FakePC.trackOnAnswer) act(() => this.ontrack?.({ streams: [this.remote], track: {} }))
  })
  constructor() {
    FakePC.instances.push(this)
  }
  async createOffer() {
    return { type: 'offer', sdp: 'v=0 offer' }
  }
  async setLocalDescription(description: { type: string; sdp: string }) {
    this.localDescription = description
  }
  fire(state: string) {
    this.connectionState = state
    act(() => this.onconnectionstatechange?.())
  }
}

const track = { stop: vi.fn() }
const stream = { getTracks: () => [track] }
const getUserMedia = vi.fn()
const ENDED = {
  status: 'ended' as const,
  outcome: 'abandoned',
  end_reason: 'hangup',
  language: null,
}

function renderPage(url = '/call') {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[url]}>
        <CallPage />
      </MemoryRouter>
    </StrictMode>,
  )
}

async function startCall(url?: string) {
  const user = userEvent.setup()
  renderPage(url)
  await user.click(screen.getByTestId('call-button'))
  await waitFor(() => expect(createCallMock).toHaveBeenCalled())
  await waitFor(() => expect(FakePC.instances[0].setRemoteDescription).toHaveBeenCalled())
  FakePC.instances[0].fire('connected')
  await screen.findByTestId('call-state-on_call')
  return user
}

beforeEach(() => {
  FakePC.instances = []
  FakePC.trackOnAnswer = false
  answerMock.mockReset().mockResolvedValue({ kind: 'ok', sdp: 'v=0 clinic', seq: 2 })
  track.stop.mockReset()
  getUserMedia.mockReset().mockResolvedValue(stream)
  createCallMock.mockReset().mockResolvedValue({
    ok: true,
    call: { callId: 'c1', secret: 's3cret', sdpAnswer: 'v=0 answer', maxCallSeconds: 1200 },
  })
  endCallMock.mockReset().mockResolvedValue(ENDED)
  getCallMock
    .mockReset()
    .mockResolvedValue({ status: 'live', outcome: null, end_reason: null, language: null })
  unloadMock.mockReset()
  reconnectMock.mockReset().mockResolvedValue({ ok: false, status: 409, reason: 'limit' })
  screenTextMock.mockReset().mockReturnValue({ status: 'fallback', text: null })
  streams = []
  streamMock.mockReset().mockImplementation(
    (_callId, _secret, onEvent, signal) =>
      new Promise<StreamEnd>((resolve) => {
        streams.push({ resolve, signal, onEvent })
        signal.addEventListener('abort', () => resolve('aborted'))
      }),
  )
  vi.stubGlobal('RTCPeerConnection', FakePC)
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CallPage', () => {
  it('places exactly one call under StrictMode, audio-only, and shows the timer', async () => {
    await startCall()
    expect(createCallMock).toHaveBeenCalledTimes(1)
    expect(createCallMock).toHaveBeenCalledWith('v=0 offer', undefined)
    expect(FakePC.instances).toHaveLength(1)
    expect(FakePC.instances[0].createDataChannel).not.toHaveBeenCalled()
    expect(FakePC.instances[0].setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'v=0 answer',
    })
    expect(screen.getByRole('timer')).toHaveTextContent('00:00')
    expect(screen.getByTestId('call-end')).toHaveFocus()
  })

  it('End call posts /end with the secret, stops the mic and shows Call ended', async () => {
    const user = await startCall()
    await user.click(screen.getByTestId('call-end'))
    expect(await screen.findByTestId('call-state-ended')).toBeInTheDocument()
    expect(endCallMock).toHaveBeenCalledWith('c1', 's3cret')
    expect(track.stop).toHaveBeenCalled()
    expect(FakePC.instances[0].close).toHaveBeenCalled()
  })

  it('ends with a keepalive request when the page is hidden', async () => {
    await startCall()
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(unloadMock).toHaveBeenCalledWith('c1', 's3cret')
  })

  it('shows microphone denied on NotAllowedError', async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('call-button'))
    expect(await screen.findByTestId('call-state-mic_denied')).toBeInTheDocument()
    expect(createCallMock).not.toHaveBeenCalled()
  })

  it('shows unsupported when WebRTC is missing', () => {
    vi.stubGlobal('RTCPeerConnection', undefined)
    renderPage()
    expect(screen.getByTestId('call-state-unsupported')).toBeInTheDocument()
  })

  it('shows service unavailable when the start is refused', async () => {
    createCallMock.mockResolvedValue({ ok: false, reason: 'unavailable' })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('call-button'))
    expect(await screen.findByTestId('call-state-unavailable')).toBeInTheDocument()
    expect(track.stop).toHaveBeenCalled()
  })

  it('a disconnected peer checks the call at once', async () => {
    await startCall()
    getCallMock.mockResolvedValue(ENDED)
    FakePC.instances[0].fire('disconnected')
    expect(getCallMock).toHaveBeenCalledWith('c1', 's3cret')
    expect(await screen.findByTestId('call-state-ended')).toBeInTheDocument()
  })

  it('follows the call-state stream instead of polling', async () => {
    const spy = vi.spyOn(window, 'setInterval')
    await startCall()
    expect(spy.mock.calls.filter(([, ms]) => ms === 5_000)).toHaveLength(0)
    expect(streamMock).toHaveBeenCalledTimes(1)
    expect(streamMock.mock.calls[0][0]).toBe('c1')
    expect(streamMock.mock.calls[0][1]).toBe('s3cret')
    spy.mockRestore()
  })

  it('an ended event while on call shows Ended and stops the mic', async () => {
    await startCall()
    await act(async () => streams[0].resolve('ended'))
    expect(await screen.findByTestId('call-state-ended')).toBeInTheDocument()
    expect(track.stop).toHaveBeenCalled()
    expect(endCallMock).not.toHaveBeenCalled()
  })

  it('an ended event while connecting shows Unavailable', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('call-button'))
    await waitFor(() => expect(streams).toHaveLength(1))
    await act(async () => streams[0].resolve('ended'))
    expect(await screen.findByTestId('call-state-unavailable')).toBeInTheDocument()
  })

  it('a dropped stream asks for the call, then reconnects after 1 s', async () => {
    await startCall()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await act(async () => streams[0].resolve('dropped'))
    expect(getCallMock).toHaveBeenCalledWith('c1', 's3cret')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_MS)
    })
    expect(streams).toHaveLength(2)
    vi.useRealTimers()
  })

  it('a dropped stream whose call ended shows Ended without /end', async () => {
    await startCall()
    getCallMock.mockResolvedValue(ENDED)
    await act(async () => streams[0].resolve('dropped'))
    expect(await screen.findByTestId('call-state-ended')).toBeInTheDocument()
    expect(endCallMock).not.toHaveBeenCalled()
  })

  it(`${MAX_STREAM_FAILURES} quick drops end the call safely with /end`, async () => {
    await startCall()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    for (let i = 0; i < MAX_STREAM_FAILURES; i += 1) {
      await waitFor(() => expect(streams).toHaveLength(i + 1))
      await act(async () => streams[i].resolve('dropped'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RECONNECT_MS)
      })
    }
    vi.useRealTimers()
    expect(await screen.findByTestId('call-state-ended')).toBeInTheDocument()
    expect(endCallMock).toHaveBeenCalledWith('c1', 's3cret')
  })

  it('unreachable status during drops (e.g. 502 in a deploy) ends the call', async () => {
    await startCall()
    getCallMock.mockResolvedValue(null)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await act(async () => streams[0].resolve('dropped'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_MS)
    })
    await waitFor(() => expect(streams).toHaveLength(2))
    await act(async () => streams[1].resolve('dropped'))
    vi.useRealTimers()
    expect(await screen.findByTestId('call-state-ended')).toBeInTheDocument()
    expect(endCallMock).toHaveBeenCalledWith('c1', 's3cret')
  })

  it('ending the call aborts the stream', async () => {
    const user = await startCall()
    await user.click(screen.getByTestId('call-end'))
    expect(streams[0].signal.aborted).toBe(true)
    expect(streamMock).toHaveBeenCalledTimes(1)
  })

  it('a failed peer connection ends the call after one grace re-check', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await startCall()
    FakePC.instances[0].fire('failed')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(endCallMock).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(await screen.findByTestId('call-state-ended')).toBeInTheDocument()
    expect(endCallMock).toHaveBeenCalledWith('c1', 's3cret')
  })

  it('a peer failing just before the swap is announced swaps on the grace re-check', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await startCall()
    FakePC.instances[0].fire('failed')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    getCallMock.mockResolvedValue({ ...LIVE, pending_session_seq: 2 })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    await waitFor(() => expect(FakePC.instances).toHaveLength(2))
    expect(endCallMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('call-state-on_call')).toBeInTheDocument()
  })

  it('a double click starts one call', async () => {
    const user = userEvent.setup()
    renderPage()
    const button = screen.getByTestId('call-button')
    await user.dblClick(button)
    await waitFor(() => expect(createCallMock).toHaveBeenCalled())
    expect(createCallMock).toHaveBeenCalledTimes(1)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('drops an invalid tester tag and reuses a valid one on Call again', async () => {
    const user = await startCall('/call?tester=t07')
    expect(createCallMock).toHaveBeenLastCalledWith('v=0 offer', 't07')
    await user.click(screen.getByTestId('call-end'))
    await user.click(await screen.findByTestId('call-again'))
    await user.click(screen.getByTestId('call-button'))
    await waitFor(() => expect(createCallMock).toHaveBeenCalledTimes(2))
    expect(createCallMock).toHaveBeenLastCalledWith('v=0 offer', 't07')
    cleanup()

    createCallMock.mockClear()
    FakePC.instances = []
    await startCall('/call?tester=a!b')
    expect(createCallMock).toHaveBeenLastCalledWith('v=0 offer', undefined)
  })

  it('shows "Tap to hear the agent" when autoplay is refused', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValue(new Error('NotAllowedError'))
    await startCall()
    act(() => FakePC.instances[0].ontrack?.({ streams: [{}], track: {} }))
    expect(await screen.findByTestId('call-audio-unlock')).toBeInTheDocument()
    play.mockRestore()
  })

  it('a crisis event mutes, pauses and drops the agent audio before anything else, then shows the crisis screen', async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    await startCall()
    const audio = screen.getByTestId('call-audio') as HTMLAudioElement
    audio.srcObject = {} as MediaStream
    act(() =>
      streams[0].onEvent({
        type: 'state',
        status: 'live',
        outcome: 'crisis',
        end_reason: 'crisis',
        language: null,
      }),
    )
    expect(audio.muted).toBe(true)
    expect(pause).toHaveBeenCalled()
    expect(audio.srcObject).toBeNull()
    expect(await screen.findByTestId('call-state-crisis')).toBeInTheDocument()
    expect(screen.getAllByText(/516-227-8255/, { selector: 'p' })).toHaveLength(2)
    expect(track.stop).toHaveBeenCalled()
    expect(screen.queryByTestId('call-again')).toBeNull()
    // A late track after the crisis plays nothing.
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
    act(() => FakePC.instances[0].ontrack?.({ streams: [{}], track: {} }))
    expect(play).not.toHaveBeenCalled()
    expect(audio.srcObject).toBeNull()
    play.mockRestore()
    pause.mockRestore()
  })

  it('a dropped stream whose status says crisis shows the crisis screen', async () => {
    await startCall()
    getCallMock.mockResolvedValue({ ...ENDED, outcome: 'crisis', end_reason: 'crisis' })
    await act(async () => streams[0].resolve('dropped'))
    expect(await screen.findByTestId('call-state-crisis')).toBeInTheDocument()
    expect(endCallMock).not.toHaveBeenCalled()
  })

  it('a silent stream (missed event, peer still connected) is polled and lands on crisis', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await startCall()
    getCallMock.mockResolvedValue({ status: 'live', outcome: 'crisis', end_reason: 'crisis', language: null })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_MS)
    })
    expect(await screen.findByTestId('call-state-crisis')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('a handoff end shows the title, and Call again unmutes the audio', async () => {
    const user = await startCall()
    act(() =>
      streams[0].onEvent({
        type: 'state',
        status: 'ended',
        outcome: 'department_handoff',
        end_reason: 'department_handoff',
        language: null,
        handoff_title: 'Residential & Day Programs',
      }),
    )
    await act(async () => streams[0].resolve('ended'))
    expect(await screen.findByTestId('call-state-handoff')).toHaveTextContent(
      'Your request is for Residential & Day Programs.',
    )
    const audio = screen.getByTestId('call-audio') as HTMLAudioElement
    expect(audio.muted).toBe(true)
    await user.click(screen.getByTestId('call-again'))
    await user.click(screen.getByTestId('call-button'))
    expect(audio.muted).toBe(false)
  })

  it('a human-needed end shows the human-needed screen', async () => {
    await startCall()
    act(() =>
      streams[0].onEvent({
        type: 'state',
        status: 'ended',
        outcome: 'human_needed',
        end_reason: 'human_needed',
        language: null,
      }),
    )
    await act(async () => streams[0].resolve('ended'))
    expect(await screen.findByTestId('call-state-human_needed')).toBeInTheDocument()
  })
})

const LIVE = { status: 'live' as const, outcome: null, end_reason: null, language: null }
const never = () => new Promise<never>(() => undefined)

async function swapEvent(seq = 2) {
  act(() => streams[0].onEvent({ type: 'session_swap', session_seq: seq }))
  await waitFor(() => expect(FakePC.instances).toHaveLength(2))
  return FakePC.instances[1]
}

describe('CallPage clinic session swap', () => {
  it('renegotiates on a second peer with the same mic track and drops the old peer', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    await startCall()
    const first = FakePC.instances[0]
    const timer = screen.getByRole('timer').textContent
    FakePC.trackOnAnswer = true
    const second = await swapEvent(2)
    await waitFor(() => expect(first.close).toHaveBeenCalled())
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(second.addTrack).toHaveBeenCalledWith(track, stream)
    expect(answerMock).toHaveBeenCalledWith('c1', 's3cret', 'v=0 offer', 2, expect.anything())
    expect(second.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'v=0 clinic' })
    const audio = screen.getByTestId('call-audio') as HTMLAudioElement
    expect(audio.srcObject).toBe(second.remote)
    expect(play).toHaveBeenCalledTimes(1)
    expect(first.ontrack).toBeNull()
    expect(first.onconnectionstatechange).toBeNull()
    expect(second.close).not.toHaveBeenCalled()
    expect(track.stop).not.toHaveBeenCalled()
    // The switchboard hang-up reaching the old peer later does nothing.
    first.fire('failed')
    second.fire('connected')
    expect(screen.getByTestId('call-state-on_call')).toBeInTheDocument()
    expect(screen.getByRole('timer').textContent).toBe(timer)
    expect(endCallMock).not.toHaveBeenCalled()
    play.mockRestore()
  })

  it('an old peer failing before the event, with a pending swap, swaps instead of ending', async () => {
    await startCall()
    getCallMock.mockResolvedValue({ ...LIVE, pending_session_seq: 2 })
    FakePC.instances[0].fire('failed')
    await waitFor(() => expect(FakePC.instances).toHaveLength(2))
    await waitFor(() => expect(FakePC.instances[0].close).toHaveBeenCalled())
    act(() => streams[0].onEvent({ type: 'session_swap', session_seq: 2 }))
    expect(FakePC.instances).toHaveLength(2)
    expect(answerMock).toHaveBeenCalledTimes(1)
    expect(endCallMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('call-state-on_call')).toBeInTheDocument()
  })

  it('a pending swap found by the status poll starts exactly one swap', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await startCall()
    getCallMock.mockResolvedValue({ ...LIVE, pending_session_seq: 3 })
    answerMock.mockResolvedValue({ kind: 'ok', sdp: 'v=0 clinic', seq: 3 })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_MS)
    })
    await waitFor(() => expect(FakePC.instances[0].close).toHaveBeenCalled())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_MS * 2)
    })
    vi.useRealTimers()
    expect(FakePC.instances).toHaveLength(2)
    expect(answerMock).toHaveBeenCalledTimes(1)
  })

  it('ignores stale and duplicate seqs', async () => {
    answerMock.mockImplementation(never)
    await startCall()
    act(() => streams[0].onEvent({ type: 'session_swap', session_seq: 1 }))
    expect(FakePC.instances).toHaveLength(1)
    await swapEvent(2)
    act(() => streams[0].onEvent({ type: 'session_swap', session_seq: 2 }))
    expect(FakePC.instances).toHaveLength(2)
  })

  it('a conflict closes only the pending peer and checks the status, without ending', async () => {
    answerMock.mockResolvedValue({ kind: 'conflict' })
    await startCall()
    getCallMock.mockClear()
    const second = await swapEvent(2)
    await waitFor(() => expect(second.close).toHaveBeenCalled())
    await waitFor(() => expect(getCallMock).toHaveBeenCalledWith('c1', 's3cret'))
    expect(FakePC.instances[0].close).not.toHaveBeenCalled()
    expect(endCallMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('call-state-on_call')).toBeInTheDocument()
  })

  it('the swap deadline aborts the request and closes the pending peer, without ending', async () => {
    answerMock.mockImplementation(never)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await startCall()
    getCallMock.mockClear()
    const second = await swapEvent(2)
    await waitFor(() => expect(answerMock).toHaveBeenCalled())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SWAP_DEADLINE_MS)
    })
    vi.useRealTimers()
    expect(second.close).toHaveBeenCalled()
    expect((answerMock.mock.calls[0][4] as AbortSignal).aborted).toBe(true)
    expect(getCallMock).toHaveBeenCalled()
    expect(FakePC.instances[0].close).not.toHaveBeenCalled()
    expect(endCallMock).not.toHaveBeenCalled()
  })

  it('End during a swap closes both peers and aborts the request', async () => {
    answerMock.mockImplementation(never)
    const user = await startCall()
    const second = await swapEvent(2)
    await waitFor(() => expect(answerMock).toHaveBeenCalled())
    await user.click(screen.getByTestId('call-end'))
    expect(FakePC.instances[0].close).toHaveBeenCalled()
    expect(second.close).toHaveBeenCalled()
    expect((answerMock.mock.calls[0][4] as AbortSignal).aborted).toBe(true)
    expect(endCallMock).toHaveBeenCalledWith('c1', 's3cret')
  })

  it('a crisis event during a swap closes both peers', async () => {
    answerMock.mockImplementation(never)
    await startCall()
    const second = await swapEvent(2)
    act(() =>
      streams[0].onEvent({ type: 'state', ...LIVE, outcome: 'crisis', end_reason: 'crisis' }),
    )
    expect(await screen.findByTestId('call-state-crisis')).toBeInTheDocument()
    expect(FakePC.instances[0].close).toHaveBeenCalled()
    expect(second.close).toHaveBeenCalled()
  })

  it('pagehide during a swap sends one keepalive end and closes both peers', async () => {
    answerMock.mockImplementation(never)
    await startCall()
    const second = await swapEvent(2)
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(unloadMock).toHaveBeenCalledTimes(1)
    expect(FakePC.instances[0].close).toHaveBeenCalled()
    expect(second.close).toHaveBeenCalled()
  })

  it('a swap event after a crisis is ignored and the audio stays muted', async () => {
    await startCall()
    act(() =>
      streams[0].onEvent({ type: 'state', ...LIVE, outcome: 'crisis', end_reason: 'crisis' }),
    )
    act(() => streams[0].onEvent({ type: 'session_swap', session_seq: 2 }))
    expect(FakePC.instances).toHaveLength(1)
    expect((screen.getByTestId('call-audio') as HTMLAudioElement).muted).toBe(true)
  })

  it('autoplay refused on the clinic track shows "Tap to hear the agent"', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('NotAllowed'))
    await startCall()
    FakePC.trackOnAnswer = true
    await swapEvent(2)
    expect(await screen.findByTestId('call-audio-unlock')).toBeInTheDocument()
    play.mockRestore()
  })

  it('after a tap, a swap and a new connected peer do not prompt again', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('NotAllowed'))
    const user = await startCall()
    act(() => FakePC.instances[0].ontrack?.({ streams: [{}], track: {} }))
    await user.click(await screen.findByTestId('call-audio-unlock'))
    play.mockResolvedValue(undefined)
    await user.click(screen.getByTestId('call-audio-unlock'))
    await waitFor(() => expect(screen.queryByTestId('call-audio-unlock')).toBeNull())
    FakePC.trackOnAnswer = true
    const second = await swapEvent(2)
    await waitFor(() => expect(FakePC.instances[0].close).toHaveBeenCalled())
    second.fire('connected')
    expect(screen.queryByTestId('call-audio-unlock')).toBeNull()
    play.mockRestore()
  })
})

describe('CallPage voice reconnect (T-FE-CALL)', () => {
  const LIVE_S = { status: 'live' as const, outcome: null, end_reason: null, language: null }
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  async function failPastGrace() {
    FakePC.instances[0].fire('failed')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100)
    })
  }

  it('a failed peer on a live call reconnects on a new peer with the same mic track', async () => {
    reconnectMock.mockResolvedValue({ ok: true, sdp_answer: 'v=0 again', session_seq: 2 })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await startCall()
    const first = FakePC.instances[0]
    await failPastGrace()
    await waitFor(() => expect(FakePC.instances).toHaveLength(2))
    const second = FakePC.instances[1]
    expect(reconnectMock).toHaveBeenCalledWith('c1', 's3cret', 'v=0 offer', expect.anything())
    expect(second.addTrack).toHaveBeenCalledWith(track, stream)
    await waitFor(() =>
      expect(second.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'v=0 again' }),
    )
    await waitFor(() => expect(first.close).toHaveBeenCalled())
    expect(await screen.findByTestId('call-state-on_call')).toBeInTheDocument()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(track.stop).not.toHaveBeenCalled()
    expect(second.close).not.toHaveBeenCalled()
    expect(endCallMock).not.toHaveBeenCalled()
  })

  it('shows Reconnecting with End call while the reconnect is pending', async () => {
    reconnectMock.mockImplementation(() => new Promise<never>(() => undefined))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await startCall()
    await failPastGrace()
    expect(await screen.findByTestId('call-state-reconnecting')).toBeInTheDocument()
    expect(screen.getByTestId('call-end')).toBeInTheDocument()
  })

  it('a refused reconnect takes the end path', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await startCall()
    await failPastGrace()
    expect(await screen.findByTestId('call-state-ended')).toBeInTheDocument()
    expect(reconnectMock).toHaveBeenCalledTimes(1)
    expect(FakePC.instances[1].close).toHaveBeenCalled()
    expect(endCallMock).toHaveBeenCalledWith('c1', 's3cret')
  })

  it('a pending session swap is swapped, never reconnected', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await startCall()
    getCallMock.mockResolvedValue({ ...LIVE_S, pending_session_seq: 2 })
    await failPastGrace()
    await waitFor(() => expect(answerMock).toHaveBeenCalled())
    expect(reconnectMock).not.toHaveBeenCalled()
  })

  it('a crisis during reconnecting shows the crisis screen (EN+ES) and ignores the answer', async () => {
    let answer: (r: ReconnectResult) => void = () => undefined
    reconnectMock.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await startCall()
    await failPastGrace()
    await screen.findByTestId('call-state-reconnecting')
    const second = FakePC.instances[1]
    act(() =>
      streams[0].onEvent({
        type: 'state',
        status: 'ended',
        outcome: 'crisis',
        end_reason: 'crisis',
        language: 'es',
      } as CallEventMsg),
    )
    expect(screen.getByTestId('call-state-crisis')).toBeInTheDocument()
    await act(async () => answer({ ok: true, sdp_answer: 'v=0 late', session_seq: 2 }))
    expect(second.setRemoteDescription).not.toHaveBeenCalled()
    expect(second.close).toHaveBeenCalled()
    expect(screen.getByTestId('call-state-crisis')).toBeInTheDocument()
    expect(screen.getByText(COPY.crisis.en)).toBeInTheDocument()
    expect(screen.getByText(COPY.crisis.es)).toBeInTheDocument()
  })

  it('crisis from on_call after a language change stays EN+ES', async () => {
    await startCall()
    act(() => streams[0].onEvent({ type: 'state', ...LIVE_S, language: 'en' } as CallEventMsg))
    act(() =>
      streams[0].onEvent({ type: 'state', ...LIVE_S, outcome: 'crisis', language: 'es' } as CallEventMsg),
    )
    expect(screen.getByText(COPY.crisis.en)).toBeInTheDocument()
    expect(screen.getByText(COPY.crisis.es)).toBeInTheDocument()
  })

  it('stores the language from the stream: Spanish end shows only Spanish', async () => {
    await startCall()
    act(() => streams[0].onEvent({ type: 'state', ...LIVE_S, language: 'es' } as CallEventMsg))
    act(() => {
      streams[0].onEvent({ type: 'state', ...ENDED, language: 'es' } as CallEventMsg)
      streams[0].resolve('ended')
    })
    expect(await screen.findByText(COPY.ended.es)).toBeInTheDocument()
    expect(screen.queryByText(COPY.ended.en)).toBeNull()
  })

  it('unavailable before the language is known stays bilingual', async () => {
    createCallMock.mockResolvedValue({ ok: false, reason: 'unavailable' })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('call-button'))
    expect(await screen.findByText(COPY.unavailable.en)).toBeInTheDocument()
    expect(screen.getByText(COPY.unavailable.es)).toBeInTheDocument()
  })

  it('if the screen-text fetch fails, the shipped EN/ES text shows (T-CALLER)', async () => {
    createCallMock.mockResolvedValue({ ok: false, reason: 'unavailable' })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('call-button'))
    expect(await screen.findByText(COPY.unavailable.en)).toBeInTheDocument()
    expect(screen.getByText(COPY.unavailable.es)).toBeInTheDocument()
    expect(screen.getByText(CRISIS.en)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '911' })).toHaveAttribute('href', 'tel:911')
  })

  it('an ar call ends in Arabic only when the server has Arabic on (T-CALLER)', async () => {
    const ar = { code: 'ar', name: 'العربية', dir: 'rtl' as const, lines: { ended: 'انتهت المكالمة.' } }
    screenTextMock.mockReturnValue({
      status: 'ready',
      text: { ...SHIPPED_SCREEN_TEXT, languages: [...SHIPPED_SCREEN_TEXT.languages, ar] },
    })
    await startCall()
    act(() => streams[0].onEvent({ type: 'state', ...LIVE_S, language: 'ar' } as CallEventMsg))
    act(() => {
      streams[0].onEvent({ type: 'state', ...ENDED, language: 'ar' } as CallEventMsg)
      streams[0].resolve('ended')
    })
    const text = await screen.findByText('انتهت المكالمة.')
    expect(text).toHaveAttribute('dir', 'rtl')
    expect(screen.queryByText(COPY.ended.en)).toBeNull()
    expect(screen.queryByText(COPY.ended.es)).toBeNull()
  })

  it('a swap request with no HTTP answer is retried once for the same seq', async () => {
    answerMock.mockResolvedValue({ kind: 'unavailable', network: true })
    await startCall()
    getCallMock.mockResolvedValue({ ...LIVE_S, pending_session_seq: 2 })
    act(() => streams[0].onEvent({ type: 'session_swap', session_seq: 2 }))
    await waitFor(() => expect(answerMock).toHaveBeenCalledTimes(2))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(answerMock).toHaveBeenCalledTimes(2)
    expect(answerMock.mock.calls.map((c) => c[3])).toEqual([2, 2])
    expect(screen.getByTestId('call-state-on_call')).toBeInTheDocument()
  })

  it.each([[{ kind: 'conflict' as const }], [{ kind: 'unavailable' as const }]])(
    'a swap answered %o is not retried',
    async (result) => {
      answerMock.mockResolvedValue(result)
      await startCall()
      getCallMock.mockResolvedValue({ ...LIVE_S, pending_session_seq: 2 })
      act(() => streams[0].onEvent({ type: 'session_swap', session_seq: 2 }))
      await waitFor(() => expect(getCallMock).toHaveBeenCalled())
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20))
      })
      expect(answerMock).toHaveBeenCalledTimes(1)
    },
  )

  it('dropVoice closes only the current peer; the hook is removed on unmount', async () => {
    await startCall()
    const w = window as Window & { __epicTest?: { dropVoice: () => void } }
    expect(w.__epicTest).toBeDefined()
    act(() => w.__epicTest?.dropVoice())
    expect(FakePC.instances[0].close).toHaveBeenCalledTimes(1)
    expect(FakePC.instances).toHaveLength(1)
    cleanup()
    expect(w.__epicTest).toBeUndefined()
  })

  it('has no test hook when the flag is off', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_EPIC_TEST_HOOKS', '')
    renderPage()
    expect((window as Window & { __epicTest?: unknown }).__epicTest).toBeUndefined()
  })

  it.each([
    ['/call?test=after_hours', { after_hours: true }],
    ['/call?test=turn_limit:2', { turn_limit: 2 }],
  ])('forwards %s to the start', async (url, test) => {
    await startCall(url)
    expect(createCallMock).toHaveBeenCalledWith('v=0 offer', undefined, test)
  })

  it('does not forward an unknown test value', async () => {
    await startCall('/call?test=bogus')
    expect(createCallMock).toHaveBeenCalledWith('v=0 offer', undefined)
  })
})
