import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AdminRoutes } from '../../admin/AdminRoutes'
import { fxReports, fxReportsEmpty } from '../../admin/fixtures/data'
import type { StaffMe } from '../../api/auth'
import { api } from '../../api/client'
import { createQueryClient } from '../../api/queryClient'

vi.mock('../../api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))

const GET = vi.mocked(api.GET) as unknown as Mock

const reply = (body: object) => ({
  data: body,
  error: undefined,
  response: { status: 200 },
})

const admin = {
  id: '00000000-0000-4000-8000-000000000002',
  email: 'ada@example.test',
  display_name: 'Ada Admin',
  role: 'admin',
  must_change_password: false,
} as StaffMe

function renderWith(reports: object) {
  GET.mockImplementation(async (path: string) => {
    if (path === '/api/admin/auth/me') return reply(admin)
    if (path === '/api/admin/reports') return reply(reports)
    return new Promise(() => {})
  })
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/admin/reports']}>
        <Routes>
          <Route path="/admin/*" element={<AdminRoutes />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const bodyRows = (testId: string) => within(screen.getByTestId(testId)).getAllByRole('row').slice(1)

beforeEach(() => {
  GET.mockReset()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('T-FE-REPORTS: gate results and unapproved content', () => {
  it('renders both sections from populated fixture data, gate first then harness then live', async () => {
    renderWith(fxReports)
    expect(await screen.findByTestId('admin-table-reports-gates')).toBeInTheDocument()
    const rows = bodyRows('admin-table-reports-gates')
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      'Release gate',
      'Story harness',
      'Story harness',
      'Live check',
    ])
    expect(rows[0]).toHaveTextContent('calls · outcome · 3; forms · status · 2')
    expect(rows[0]).toHaveTextContent('$1.95')
    const failed = rows.find((r) => within(r).queryByText('story-billing-es'))
    expect(failed).toHaveTextContent('✗ Failed')
    expect(failed).toHaveTextContent('Max turns')
    expect(failed).toHaveTextContent('flags · missing_contact · 1')
    expect(rows[3]).toHaveTextContent('✓ Passed')
    expect(screen.queryByTestId('reports-gates-empty')).not.toBeInTheDocument()

    const unapproved = bodyRows('admin-table-reports-unapproved')
    expect(unapproved).toHaveLength(2)
    expect(unapproved[0]).toHaveTextContent('content/greeting.en.md')
    expect(unapproved[0]).toHaveTextContent('Placeholder')
    expect(unapproved[1]).toHaveTextContent('Awaiting epic review')
    expect(screen.getByRole('heading', { name: 'Unapproved content' })).toBeInTheDocument()
    expect(screen.queryByTestId('reports-unapproved-empty')).not.toBeInTheDocument()
  })

  it('shows each empty state when there are no results and nothing unapproved', async () => {
    renderWith(fxReportsEmpty)
    expect(await screen.findByTestId('reports-gates-empty')).toHaveTextContent('No gate results yet')
    expect(screen.getByTestId('reports-unapproved-empty')).toHaveTextContent('All content is approved by EPIC')
    expect(screen.queryByTestId('admin-table-reports-gates')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-table-reports-unapproved')).not.toBeInTheDocument()
  })

  it('shows skeleton tables while loading', async () => {
    GET.mockImplementation(async (path: string) =>
      path === '/api/admin/auth/me' ? reply(admin) : new Promise(() => {}),
    )
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={['/admin/reports']}>
          <Routes>
            <Route path="/admin/*" element={<AdminRoutes />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByTestId('reports-gates-loading')).toBeInTheDocument()
    expect(screen.getByTestId('reports-unapproved-loading')).toBeInTheDocument()
  })
})
