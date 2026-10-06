import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import { App } from '../App'

vi.mock('../api/client', () => ({
  api: { GET: vi.fn(() => new Promise(() => {})) },
}))

afterEach(cleanup)

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

  it('renders the call page honestly, with no call button', async () => {
    renderAt('/call')
    expect(await screen.findByText('Calls are recorded.')).toBeInTheDocument()
    expect(screen.getByText('Use fictional details only — this is a test line.')).toBeInTheDocument()
    expect(screen.getByText('Calling opens with the talking demo.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
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
