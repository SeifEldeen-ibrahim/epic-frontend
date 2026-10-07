import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { handle } from '../api/admin'
import type { StaffMe } from '../api/auth'
import { api } from '../api/client'
import { createQueryClient } from '../api/queryClient'
import { App } from '../App'

vi.mock('../api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))

const GET = vi.mocked(api.GET) as unknown as Mock
const POST = vi.mocked(api.POST) as unknown as Mock

function reply(status: number, body: object | undefined) {
  const ok = status < 400
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status } }
}

const base: StaffMe = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'ada@example.test',
  display_name: 'Ada Admin',
  role: 'admin',
  must_change_password: false,
} as StaffMe
const admin = base
const reviewer = { ...base, role: 'reviewer', display_name: 'Rey Reviewer' } as StaffMe
const mustChange = { ...base, must_change_password: true } as StaffMe

/** me answers with the user (or 401); every other GET stays pending. */
function signIn(user: StaffMe | null) {
  GET.mockImplementation(async (path: string) => {
    if (path === '/api/admin/auth/me') return user ? reply(200, user) : reply(401, { detail: 'not_authenticated' })
    return new Promise(() => {})
  })
}

function Probe() {
  const l = useLocation()
  return <div data-testid="location">{l.pathname + l.search}</div>
}

function renderAt(path: string, qc: QueryClient = createQueryClient()) {
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return qc
}

const where = () => screen.getByTestId('location').textContent

beforeEach(() => {
  GET.mockReset()
  POST.mockReset()
})
afterEach(cleanup)

describe('admin guards', () => {
  it('sends a signed-out visitor to login with next set to the page', async () => {
    signIn(null)
    renderAt('/admin/calls')
    expect(await screen.findByTestId('login-email')).toBeInTheDocument()
    await waitFor(() => expect(where()).toBe('/admin/login?next=%2Fadmin%2Fcalls'))
    expect(screen.queryByTestId('admin-shell')).toBeNull()
  })

  it('a 401 mid-session returns to login with next set to the current page', async () => {
    signIn(admin)
    const qc = renderAt('/admin/reports?period=week')
    expect(await screen.findByTestId('admin-reports')).toBeInTheDocument()
    signIn(null)
    act(() => {
      expect(() => handle(qc, reply(401, { detail: 'not_authenticated' }))).toThrow()
    })
    expect(await screen.findByTestId('login-email')).toBeInTheDocument()
    expect(where()).toBe('/admin/login?next=%2Fadmin%2Freports%3Fperiod%3Dweek')
    expect(screen.queryByTestId('admin-shell')).toBeNull()
  })

  it('keeps a must-change user on the account page with only Account in the nav', async () => {
    signIn(mustChange)
    renderAt('/admin/queue')
    expect(await screen.findByTestId('admin-account')).toBeInTheDocument()
    expect(where()).toBe('/admin/account')
    const nav = screen.getByTestId('admin-nav')
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Account'])
    expect(screen.getByTestId('admin-logout')).toBeInTheDocument()
  })

  it.each(['/admin/exports', '/admin/audit'])('shows a reviewer the 403 page on %s', async (path) => {
    signIn(reviewer)
    renderAt(path)
    const forbidden = await screen.findByTestId('forbidden')
    expect(forbidden).toHaveTextContent("You don't have access to this page")
    expect(within(forbidden).getByRole('link')).toHaveAttribute('href', '/admin/queue')
    const nav = screen.getByTestId('admin-nav')
    expect(within(nav).queryByRole('link', { name: 'Exports' })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Audit' })).toBeNull()
    expect(within(nav).getByRole('link', { name: 'Queue' })).toBeInTheDocument()
  })

  it.each([
    ['/admin/exports', 'admin-exports'],
    ['/admin/audit', 'admin-audit'],
  ])('lets an admin open %s and see both nav links', async (path, testId) => {
    signIn(admin)
    renderAt(path)
    expect(await screen.findByTestId(testId)).toBeInTheDocument()
    const nav = screen.getByTestId('admin-nav')
    expect(within(nav).getByRole('link', { name: 'Exports' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Audit' })).toBeInTheDocument()
  })

  it('redirects /admin to /admin/queue and marks the current nav link', async () => {
    signIn(admin)
    renderAt('/admin')
    expect(await screen.findByTestId('admin-queue')).toBeInTheDocument()
    expect(where()).toBe('/admin/queue')
    expect(screen.getByRole('link', { name: 'Queue' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Calls' })).not.toHaveAttribute('aria-current')
  })

  it('sends a signed-in user away from the login page to the queue', async () => {
    signIn(admin)
    renderAt('/admin/login')
    expect(await screen.findByTestId('admin-queue')).toBeInTheDocument()
    expect(where()).toBe('/admin/queue')
  })

  it('never renders the shell on the login page', async () => {
    signIn(null)
    renderAt('/admin/login')
    expect(await screen.findByTestId('login-email')).toBeInTheDocument()
    await waitFor(() => expect(GET).toHaveBeenCalled())
    expect(screen.queryByTestId('admin-shell')).toBeNull()
  })

  it('the Suspense and session fallbacks are not the shell', async () => {
    GET.mockReturnValue(new Promise(() => {}))
    renderAt('/admin/queue')
    expect(screen.queryByTestId('admin-shell')).toBeNull()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(await screen.findByTestId('admin-auth-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-shell')).toBeNull()
  })

  it('shows a retryable error when the session check fails', async () => {
    GET.mockResolvedValueOnce(reply(500, { detail: 'boom' }))
    renderAt('/admin/queue')
    expect(await screen.findByTestId('admin-auth-error')).toBeInTheDocument()
    signIn(admin)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByTestId('admin-shell')).toBeInTheDocument()
  })

  it('signs out from the shell back to the login page', async () => {
    signIn(admin)
    POST.mockResolvedValue({ data: undefined, error: undefined, response: { status: 204 } })
    renderAt('/admin/calls')
    expect(await screen.findByTestId('admin-calls')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('admin-logout'))
    expect(await screen.findByTestId('login-email')).toBeInTheDocument()
    expect(POST).toHaveBeenCalledWith('/api/admin/auth/logout', expect.anything())
  })
})
