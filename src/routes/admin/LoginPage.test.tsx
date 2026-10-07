import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AdminRoutes } from '../../admin/AdminRoutes'
import type { StaffMe } from '../../api/auth'
import { api } from '../../api/client'
import { createQueryClient } from '../../api/queryClient'

vi.mock('../../api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))

const GET = vi.mocked(api.GET) as unknown as Mock
const POST = vi.mocked(api.POST) as unknown as Mock

function reply(status: number, body: object) {
  const ok = status < 400
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status } }
}

const user = {
  id: '00000000-0000-4000-8000-000000000002',
  email: 'ada@example.test',
  display_name: 'Ada Admin',
  role: 'admin',
  must_change_password: false,
} as StaffMe

function Probe() {
  const l = useLocation()
  return <div data-testid="location">{l.pathname + l.search}</div>
}

function renderLogin(next?: string) {
  const path = next === undefined ? '/admin/login' : `/admin/login?next=${encodeURIComponent(next)}`
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/*" element={<AdminRoutes />} />
        </Routes>
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function fillAndSubmit() {
  await userEvent.type(await screen.findByTestId('login-email'), 'ada@example.test')
  await userEvent.type(screen.getByTestId('login-password'), 'a fictional password')
  await userEvent.click(screen.getByTestId('login-submit'))
}

const where = () => screen.getByTestId('location').textContent

beforeEach(() => {
  GET.mockReset()
  POST.mockReset()
  GET.mockImplementation(async (path: string) =>
    path === '/api/admin/auth/me' ? reply(401, { detail: 'not_authenticated' }) : new Promise(() => {}),
  )
})
afterEach(cleanup)

describe('LoginPage', () => {
  it('renders email, password and submit in tab order', async () => {
    renderLogin()
    const email = await screen.findByTestId('login-email')
    expect(email).toHaveAccessibleName('Email')
    expect(screen.getByTestId('login-password')).toHaveAccessibleName('Password')
    await userEvent.tab()
    expect(email).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByTestId('login-password')).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByTestId('login-submit')).toHaveFocus()
    expect(screen.queryByTestId('admin-shell')).toBeNull()
  })

  it('disables the button while signing in', async () => {
    POST.mockReturnValue(new Promise(() => {}))
    renderLogin()
    await fillAndSubmit()
    const submit = screen.getByTestId('login-submit')
    expect(submit).toBeDisabled()
    expect(submit).toHaveTextContent('Signing in…')
    expect(POST).toHaveBeenCalledWith('/api/admin/auth/login', {
      body: { email: 'ada@example.test', password: 'a fictional password' },
    })
  })

  it('shows the generic message on 401', async () => {
    POST.mockResolvedValue(reply(401, { detail: 'invalid_credentials' }))
    renderLogin()
    await fillAndSubmit()
    expect(await screen.findByTestId('login-error')).toHaveTextContent('Email or password is incorrect.')
    expect(screen.getByTestId('login-submit')).toBeEnabled()
  })

  it('shows the server sentence on 401 when it sends one', async () => {
    POST.mockResolvedValue(reply(401, { detail: 'Invalid email or password.' }))
    renderLogin()
    await fillAndSubmit()
    expect(await screen.findByTestId('login-error')).toHaveTextContent('Invalid email or password.')
  })

  it('shows the rate-limit message on 429', async () => {
    POST.mockResolvedValue(reply(429, { detail: 'too_many_attempts' }))
    renderLogin()
    await fillAndSubmit()
    expect(await screen.findByTestId('login-error')).toHaveTextContent('Too many attempts, try again shortly.')
  })

  it('goes to a same-origin admin next after success', async () => {
    POST.mockResolvedValue(reply(200, user))
    renderLogin('/admin/calls?status=approved')
    await fillAndSubmit()
    expect(await screen.findByTestId('admin-calls')).toBeInTheDocument()
    expect(where()).toBe('/admin/calls?status=approved')
    expect(screen.getByTestId('admin-shell')).toBeInTheDocument()
  })

  it.each(['//evil.com', '/\\evil.com', 'https://evil.com/admin', 'javascript:alert(1)', '/call', '/admin/login'])(
    'falls back to Home for next=%s',
    async (next) => {
      POST.mockResolvedValue(reply(200, user))
      renderLogin(next)
      await fillAndSubmit()
      expect(await screen.findByTestId('admin-home')).toBeInTheDocument()
      expect(where()).toBe('/admin')
    },
  )

  it('sends a must-change user to the account page', async () => {
    POST.mockResolvedValue(reply(200, { ...user, must_change_password: true }))
    renderLogin('/admin/calls')
    await fillAndSubmit()
    expect(await screen.findByTestId('account-forced')).toHaveTextContent('Choose a new password to continue')
    expect(where()).toBe('/admin/account')
  })
})
