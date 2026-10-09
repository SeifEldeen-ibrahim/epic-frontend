import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { StaffMe } from '../api/auth'
import { api } from '../api/client'
import { createQueryClient } from '../api/queryClient'
import { App } from '../App'

vi.mock('../api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
const GET = vi.mocked(api.GET) as unknown as Mock

const admin = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'ada@example.test',
  display_name: 'Ada Admin',
  role: 'admin',
  must_change_password: false,
} as StaffMe
const reviewer = { ...admin, role: 'reviewer', display_name: 'Rey Reviewer' } as StaffMe

function signIn(user: StaffMe) {
  GET.mockImplementation(async (path: string) =>
    path === '/api/admin/auth/me' ? { data: user, error: undefined, response: { status: 200 } } : new Promise(() => {}),
  )
}

async function renderAt(path: string, user: StaffMe = admin) {
  signIn(user)
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <button type="button" data-testid="outside">
          outside
        </button>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return within(await screen.findByTestId('admin-nav'))
}

beforeAll(async () => {
  await import('./AdminRoutes')
}, 30_000)
beforeEach(() => {
  GET.mockReset()
})
afterEach(cleanup)

describe('xxadminformsfixxx: header menu', () => {
  it('opens one dropdown at a time and closes on Escape with focus back on its button', async () => {
    const nav = await renderAt('/admin/calls')
    const daily = nav.getByTestId('admin-nav-trigger-daily')
    expect(daily).toHaveAttribute('aria-expanded', 'false')
    expect(nav.queryByRole('link', { name: 'Calls' })).toBeNull() // closed menu: links hidden
    await userEvent.click(daily)
    expect(daily).toHaveAttribute('aria-expanded', 'true')
    expect(nav.getByRole('link', { name: 'Calls' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(nav.getByTestId('admin-nav-trigger-setup'))
    expect(daily).toHaveAttribute('aria-expanded', 'false')
    expect(nav.getByRole('link', { name: 'Knowledge' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    expect(nav.getByTestId('admin-nav-trigger-setup')).toHaveAttribute('aria-expanded', 'false')
    expect(nav.getByTestId('admin-nav-trigger-setup')).toHaveFocus()
  })

  it('highlights the group of the current page and closes on an outside click or a link', async () => {
    const nav = await renderAt('/admin/calls')
    expect(screen.getByTestId('admin-nav-group-daily')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('admin-nav-group-setup')).not.toHaveAttribute('data-active')
    await userEvent.click(nav.getByTestId('admin-nav-trigger-more'))
    await userEvent.click(screen.getByTestId('outside'))
    expect(nav.getByTestId('admin-nav-trigger-more')).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(nav.getByTestId('admin-nav-trigger-setup'))
    await userEvent.click(nav.getByRole('link', { name: 'Departments' }))
    expect(nav.getByTestId('admin-nav-trigger-setup')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('admin-nav-group-setup')).toHaveAttribute('data-active', 'true')
  })

  it('reviewers see only Account under More; the phone Menu button toggles the 4 items', async () => {
    const nav = await renderAt('/admin', reviewer)
    await userEvent.click(nav.getByTestId('admin-nav-trigger-more'))
    const more = within(screen.getByTestId('admin-nav-group-more'))
    expect(more.getAllByRole('link').map((a) => a.textContent)).toEqual(['Account'])
    const menu = nav.getByTestId('admin-nav-menu')
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(menu.getAttribute('aria-controls') ?? '')).toHaveClass('admin-nav__top--open')
    await userEvent.keyboard('{Escape}')
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(menu).toHaveFocus()
    expect(screen.getByText('Rey Reviewer')).toBeInTheDocument()
    expect(screen.getByTestId('admin-logout')).toBeInTheDocument()
  })

  it('T-LANG-PAGES: admins find Language under More', async () => {
    const nav = await renderAt('/admin')
    await userEvent.click(nav.getByTestId('admin-nav-trigger-more'))
    const more = within(screen.getByTestId('admin-nav-group-more'))
    expect(more.getByRole('link', { name: 'Language' })).toHaveAttribute('href', '/admin/languages')
  })
})
