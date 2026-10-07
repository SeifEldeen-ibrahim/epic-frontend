import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AdminRoutes } from '../../admin/AdminRoutes'
import { sessionQueryKey, type Session, type StaffMe } from '../../api/auth'
import { api } from '../../api/client'
import { createQueryClient } from '../../api/queryClient'
import { AccountPage } from './AccountPage'

vi.mock('../../api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))

const GET = vi.mocked(api.GET) as unknown as Mock
const POST = vi.mocked(api.POST) as unknown as Mock

function reply(status: number, body: object) {
  const ok = status < 400
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status } }
}

const user = {
  id: '00000000-0000-4000-8000-000000000003',
  email: 'rey@example.test',
  display_name: 'Rey Reviewer',
  role: 'reviewer',
  must_change_password: false,
} as StaffMe
const forcedUser = { ...user, must_change_password: true } as StaffMe

function Probe() {
  const l = useLocation()
  return <div data-testid="location">{l.pathname}</div>
}

/** Standalone page with a preset session (for focus order and validation). */
function renderPage(session: Session) {
  const qc = createQueryClient()
  qc.setQueryData(sessionQueryKey, session)
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Full admin routes so the post-change redirect is observable. */
function renderRoutes(me: StaffMe) {
  GET.mockImplementation(async (path: string) =>
    path === '/api/admin/auth/me' ? reply(200, me) : new Promise(() => {}),
  )
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/admin/account']}>
        <Routes>
          <Route path="/admin/*" element={<AdminRoutes />} />
        </Routes>
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function fill(current: string, next: string, confirm: string) {
  if (current) await userEvent.type(screen.getByTestId('account-current'), current)
  if (next) await userEvent.type(screen.getByTestId('account-new'), next)
  if (confirm) await userEvent.type(screen.getByTestId('account-confirm'), confirm)
  await userEvent.click(screen.getByTestId('account-submit'))
}

beforeEach(() => {
  GET.mockReset()
  POST.mockReset()
})
afterEach(cleanup)

describe('AccountPage', () => {
  it('shows the forced banner and tabs through every control in order', async () => {
    renderPage({ state: 'must-change', user: forcedUser })
    expect(screen.getByTestId('account-forced')).toHaveTextContent('Choose a new password to continue')
    for (const id of ['account-current', 'account-new', 'account-confirm', 'account-submit']) {
      await userEvent.tab()
      expect(screen.getByTestId(id)).toHaveFocus()
    }
  })

  it('has no forced banner for a normal user', () => {
    renderPage({ state: 'signed-in', user })
    expect(screen.queryByTestId('account-forced')).toBeNull()
    expect(screen.getByTestId('admin-account')).toHaveTextContent('rey@example.test')
  })

  it('requires 12+ characters and a matching confirmation', async () => {
    renderPage({ state: 'signed-in', user })
    await fill('old fictional pw', 'short', 'different')
    const next = screen.getByTestId('account-new')
    expect(next).toHaveAttribute('aria-invalid', 'true')
    expect(next).toHaveAccessibleDescription(/Use at least 12 characters\./)
    expect(screen.getByTestId('account-confirm')).toHaveAccessibleDescription('The passwords do not match.')
    expect(POST).not.toHaveBeenCalled()
  })

  it('requires the current password', async () => {
    renderPage({ state: 'signed-in', user })
    await fill('', 'a long fictional pw', 'a long fictional pw')
    expect(screen.getByTestId('account-current')).toHaveAccessibleDescription('Enter your current password.')
    expect(POST).not.toHaveBeenCalled()
  })

  it('shows a server error', async () => {
    POST.mockResolvedValue(reply(400, { detail: 'invalid_current_password' }))
    renderPage({ state: 'signed-in', user })
    await fill('wrong fictional', 'a long fictional pw', 'a long fictional pw')
    expect(await screen.findByTestId('account-error')).toHaveTextContent('Your current password is incorrect.')
    expect(screen.queryByTestId('account-success')).toBeNull()
  })

  it('confirms a voluntary change in place', async () => {
    POST.mockResolvedValue(reply(200, user))
    renderPage({ state: 'signed-in', user })
    await fill('old fictional pw', 'a long fictional pw', 'a long fictional pw')
    expect(await screen.findByTestId('account-success')).toHaveTextContent('Password changed')
    expect(POST).toHaveBeenCalledWith('/api/admin/auth/change-password', {
      body: { current_password: 'old fictional pw', new_password: 'a long fictional pw' },
    })
  })

  it('goes to Home after a forced change', async () => {
    POST.mockResolvedValue(reply(200, user))
    renderRoutes(forcedUser)
    expect(await screen.findByTestId('account-forced')).toBeInTheDocument()
    await fill('temp fictional pw', 'a long fictional pw', 'a long fictional pw')
    expect(await screen.findByTestId('admin-home')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/admin$/)
  })
})
