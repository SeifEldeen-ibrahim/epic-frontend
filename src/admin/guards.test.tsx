import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
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

// The admin area is a lazy chunk; load it once up front so its first (slow, cold) transform does
// not eat into each test's 1 s find timeout.
beforeAll(async () => {
  await import('./AdminRoutes')
}, 30_000)

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

  it.each(['/admin/exports', '/admin/audit', '/admin/settings', '/admin/languages', '/admin/languages/ar'])('shows a reviewer the 403 page on %s', async (path) => {
    signIn(reviewer)
    renderAt(path)
    const forbidden = await screen.findByTestId('forbidden')
    expect(forbidden).toHaveTextContent("You don't have access to this page")
    expect(within(forbidden).getByRole('link')).toHaveAttribute('href', '/admin')
    const nav = screen.getByTestId('admin-nav')
    // Menus start closed: query the links inside them too (hidden: true).
    expect(within(nav).queryByRole('link', { name: 'Exports', hidden: true })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Audit log', hidden: true })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Voice settings', hidden: true })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Language', hidden: true })).toBeNull()
    expect(within(nav).getByRole('link', { name: 'Approval queue', hidden: true })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Account', hidden: true })).toBeInTheDocument()
  })

  it.each([
    ['/admin/exports', 'admin-exports'],
    ['/admin/audit', 'admin-audit'],
    ['/admin/settings', 'admin-settings'],
    ['/admin/languages', 'admin-languages'],
    ['/admin/languages/ar', 'admin-language-detail'],
  ])('lets an admin open %s and see the admin nav links', async (path, testId) => {
    signIn(admin)
    renderAt(path)
    expect(await screen.findByTestId(testId)).toBeInTheDocument()
    const nav = screen.getByTestId('admin-nav')
    expect(within(nav).getByRole('link', { name: 'Exports', hidden: true })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Audit log', hidden: true })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Voice settings', hidden: true })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Language', hidden: true })).toHaveAttribute('href', '/admin/languages')
    expect(screen.getByTestId('admin-nav-group-more')).toHaveAttribute('data-active', 'true')
  })

  it('opens Home at /admin and marks only the Home nav link', async () => {
    signIn(admin)
    renderAt('/admin')
    expect(await screen.findByTestId('admin-home')).toBeInTheDocument()
    expect(where()).toBe('/admin')
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Approval queue', hidden: true })).not.toHaveAttribute('aria-current')
  })

  it('groups the menu into 4 items: Home, then Daily work, Setup and More as dropdowns', async () => {
    signIn(admin)
    renderAt('/admin')
    expect(await screen.findByTestId('admin-home')).toBeInTheDocument()
    const nav = screen.getByTestId('admin-nav')
    // Closed: only Home is a visible link; the three groups are buttons.
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Home'])
    expect(
      within(nav)
        .getAllByRole('button', { expanded: false })
        .map((b) => b.textContent?.replace('▾', '').trim()),
    ).toEqual(['Menu', 'Daily work', 'Setup', 'More'])
    const links = (group: string) =>
      within(screen.getByTestId(`admin-nav-group-${group}`)).getAllByRole('link', { hidden: true }).map((a) => a.textContent)
    expect(links('daily')).toEqual(['Approval queue', 'Follow-up', 'Calls', 'Reports'])
    expect(links('setup')).toEqual(['Knowledge', 'Departments', 'Forms', 'Agents', 'History'])
    expect(links('more')).toEqual(['Voice settings', 'Language', 'Exports', 'Audit log', 'Account'])
  })

  it('sends a signed-in user away from the login page to Home', async () => {
    signIn(admin)
    renderAt('/admin/login')
    expect(await screen.findByTestId('admin-home')).toBeInTheDocument()
    expect(where()).toBe('/admin')
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

  it('admin-only create pages are forbidden for a reviewer; config pages are readable', async () => {
    signIn(reviewer)
    renderAt('/admin/agents/new')
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument()
    cleanup()
    signIn(reviewer)
    renderAt('/admin/forms/new')
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument()
    cleanup()
    signIn(reviewer)
    renderAt('/admin/knowledge')
    expect(await screen.findByTestId('admin-knowledge')).toBeInTheDocument()
    const nav = screen.getByTestId('admin-nav')
    for (const key of ['knowledge', 'agents', 'forms', 'versions']) {
      expect(within(nav).getByTestId(`admin-nav-${key}`)).toBeInTheDocument()
    }
  })
})
