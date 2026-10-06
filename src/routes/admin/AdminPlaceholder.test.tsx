import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import { createQueryClient } from '../../api/queryClient'
import { AdminPlaceholder } from './AdminPlaceholder'

vi.mock('../../api/client', () => ({ api: { GET: vi.fn() } }))

const GET = vi.mocked(api.GET) as unknown as ReturnType<typeof vi.fn>

function reply(status: number, body: object) {
  const ok = status === 200
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status } }
}

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <AdminPlaceholder />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AdminPlaceholder status card', () => {
  beforeEach(() => {
    GET.mockReset()
  })
  afterEach(cleanup)

  it('shows loading while the health request is pending', () => {
    GET.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByTestId('admin-placeholder')).toBeInTheDocument()
    expect(screen.getByText('Staff pages arrive with the admin site.')).toBeInTheDocument()
    expect(screen.getByTestId('status-loading')).toBeInTheDocument()
    expect(screen.getByTestId('status-loading').querySelector('[role=status]')).not.toBeNull()
    expect(document.querySelector('a')).toBeNull()
  })

  it('shows ok with database and storage ok', async () => {
    GET.mockResolvedValue(reply(200, { status: 'ok', db: 'ok', storage: 'ok' }))
    renderPage()
    const ok = await screen.findByTestId('status-ok')
    expect(ok).toHaveTextContent(/Database\s*ok/)
    expect(ok).toHaveTextContent(/Storage\s*ok/)
    expect(document.title).toBe('Admin · EPIC Voice Agent')
  })

  it('shows which part failed when degraded, with retry', async () => {
    GET.mockResolvedValue(reply(503, { status: 'degraded', db: 'ok', storage: 'error' }))
    renderPage()
    const err = await screen.findByTestId('status-error')
    expect(err).toHaveTextContent('Not working: storage.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows error on request failure and retry refetches', async () => {
    GET.mockResolvedValueOnce(reply(500, {}))
    GET.mockResolvedValueOnce(reply(200, { status: 'ok', db: 'ok', storage: 'ok' }))
    renderPage()
    expect(await screen.findByTestId('status-error')).toHaveTextContent('Could not reach the server')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByTestId('status-ok')).toBeInTheDocument()
    expect(GET).toHaveBeenCalledTimes(2)
  })
})
