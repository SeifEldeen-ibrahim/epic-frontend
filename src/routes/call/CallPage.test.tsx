import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamCallEvents, type StreamEnd } from '../../api/callEvents'
import { createCall, endCall, endCallOnUnload, getCall } from '../../api/calls'
import { CallPage } from './CallPage'
import { MAX_STREAM_FAILURES, RECONNECT_MS } from './useCall'

vi.mock('../../api/calls', () => ({
  createCall: vi.fn(),
  endCall: vi.fn(),
  getCall: vi.fn(),
  endCallOnUnload: vi.fn(),
}))

vi.mock('../../api/callEvents', () => ({ streamCallEvents: vi.fn() }))

const streamMock = vi.mocked(streamCallEvents)
/** Each stream connection waits here until the test resolves it (or the page aborts it). */
let streams: { resolve: (end: StreamEnd) => void; signal: AbortSignal }[] = []

const createCallMock = vi.mocked(createCall)
const endCallMock = vi.mocked(endCall)
const getCallMock = vi.mocked(getCall)
const unloadMock = vi.mocked(endCallOnUnload)

class FakePC {
  static instances: FakePC[] = []
  connectionState = 'new'
  localDescription: { type: string; sdp: string } | null = null
  ontrack: ((event: unknown) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  addTrack = vi.fn()
  createDataChannel = vi.fn()
  close = vi.fn()
  setRemoteDescription = vi.fn(async () => undefined)
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
  streams = []
  streamMock.mockReset().mockImplementation(
    (_callId, _secret, _onEvent, signal) =>
      new Promise<StreamEnd>((resolve) => {
        streams.push({ resolve, signal })
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

  it('a failed peer connection ends the call', async () => {
    await startCall()
    FakePC.instances[0].fire('failed')
    expect(await screen.findByTestId('call-state-ended')).toBeInTheDocument()
    expect(endCallMock).toHaveBeenCalledWith('c1', 's3cret')
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
})
