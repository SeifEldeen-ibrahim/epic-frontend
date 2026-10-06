import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCall, endCall, endCallOnUnload, getCall } from '../../api/calls'
import { CallPage } from './CallPage'
import { POLL_MS } from './useCall'

vi.mock('../../api/calls', () => ({
  createCall: vi.fn(),
  endCall: vi.fn(),
  getCall: vi.fn(),
  endCallOnUnload: vi.fn(),
}))

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
const ENDED = { status: 'ended' as const, outcome: 'abandoned', end_reason: 'hangup' }

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
  getCallMock.mockReset().mockResolvedValue({ status: 'live', outcome: null, end_reason: null })
  unloadMock.mockReset()
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

  it('registers a 5 s poll that reads the call with the secret', async () => {
    const spy = vi.spyOn(window, 'setInterval')
    await startCall()
    const poll = spy.mock.calls.find(([, ms]) => ms === POLL_MS)
    expect(poll).toBeDefined()
    getCallMock.mockResolvedValue(ENDED)
    await act(async () => {
      ;(poll![0] as () => void)()
    })
    expect(getCallMock).toHaveBeenCalledWith('c1', 's3cret')
    expect(await screen.findByTestId('call-state-ended')).toBeInTheDocument()
    spy.mockRestore()
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
