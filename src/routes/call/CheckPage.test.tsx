import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import { createQueryClient } from '../../api/queryClient'
import { CheckPage } from './CheckPage'

vi.mock('../../api/client', () => ({ api: { GET: vi.fn() } }))
const GET = vi.mocked(api.GET) as unknown as ReturnType<typeof vi.fn>

const track = { stop: vi.fn() }
const getUserMedia = vi.fn()

class FakeAudioContext {
  static closed = 0
  resume = vi.fn(async () => undefined)
  close = vi.fn(async () => {
    FakeAudioContext.closed += 1
  })
  createAnalyser() {
    return {
      fftSize: 0,
      getByteTimeDomainData: (arr: Uint8Array) => arr.fill(192),
    }
  }
  createMediaStreamSource() {
    return { connect: vi.fn() }
  }
}

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <CheckPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  GET.mockReset().mockResolvedValue({
    data: { status: 'ok', db: 'ok', storage: 'ok' },
    error: undefined,
    response: { status: 200 },
  })
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [track] })
  track.stop.mockReset()
  FakeAudioContext.closed = 0
  vi.stubGlobal('RTCPeerConnection', class {})
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CheckPage', () => {
  it('shows browser, connection and backend checks', async () => {
    renderPage()
    expect(screen.getByTestId('call-check')).toBeInTheDocument()
    expect(screen.getByText('Browser can place calls')).toBeInTheDocument()
    expect(screen.getByText('Secure connection (https)')).toBeInTheDocument()
    expect(await screen.findByText('Reachable')).toBeInTheDocument()
    expect(screen.getByText('Not tested')).toBeInTheDocument()
  })

  it('tests the microphone with a live level and releases it on leave', async () => {
    const user = userEvent.setup()
    const { unmount } = renderPage()
    await user.click(screen.getByRole('button', { name: 'Test microphone' }))
    expect(await screen.findByText('Working')).toBeInTheDocument()
    expect(screen.getByTestId('call-check-meter')).toHaveAttribute('value', '50')
    unmount()
    expect(track.stop).toHaveBeenCalled()
    expect(FakeAudioContext.closed).toBe(1)
  })

  it('reports a blocked microphone', async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Test microphone' }))
    expect(await screen.findByText('Blocked')).toBeInTheDocument()
  })

  it('reports an unreachable backend', async () => {
    GET.mockRejectedValue(new TypeError('Failed to fetch'))
    renderPage()
    expect(await screen.findByText('Not reachable')).toBeInTheDocument()
  })
})
