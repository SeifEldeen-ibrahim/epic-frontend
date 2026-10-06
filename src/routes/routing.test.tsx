import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import { App } from '../App'

vi.mock('../api/client', () => ({
  api: { GET: vi.fn(() => new Promise(() => {})) },
}))

beforeEach(() => {
  vi.stubGlobal('RTCPeerConnection', class {})
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn() },
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('routing', () => {
  it('redirects / to /call', async () => {
    renderAt('/')
    expect(await screen.findByTestId('call-page')).toBeInTheDocument()
    expect(document.title).toBe('Call · EPIC Voice Agent')
  })

  it('renders the idle call page with the Call button', async () => {
    renderAt('/call')
    expect(await screen.findByTestId('call-state-idle')).toBeInTheDocument()
    expect(screen.getByText('Calls are recorded.')).toBeInTheDocument()
    expect(screen.getByText('Use fictional details only — this is a test line.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Call' })).toBeEnabled()
  })

  it('renders the call check page', async () => {
    renderAt('/call/check')
    expect(await screen.findByTestId('call-check')).toBeInTheDocument()
  })

  it('renders 404 for an unknown path with a link back to /call', async () => {
    renderAt('/nope')
    expect(await screen.findByTestId('not-found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /call page/i })).toHaveAttribute('href', '/call')
  })

  it('renders the login placeholder without inputs', async () => {
    renderAt('/admin/login')
    expect(await screen.findByTestId('login-placeholder')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
