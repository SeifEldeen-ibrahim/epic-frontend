import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AdminRoutes } from '../../admin/AdminRoutes'
import {
  fxAdmin,
  fxAgents,
  fxCatalog,
  fxConfigReviewer,
  fxConfigState,
  fxForms,
  fxReviewer,
  fxRouting,
  fxVersionDiff,
  fxVersions,
} from '../../admin/fixtures/data'
import { api } from '../../api/client'
import { createQueryClient } from '../../api/queryClient'

vi.mock('../../api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() } }))

const GET = vi.mocked(api.GET) as unknown as Mock
const POST = vi.mocked(api.POST) as unknown as Mock
const PUT = vi.mocked(api.PUT) as unknown as Mock

function reply(status: number, body: object) {
  const ok = status < 400
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status } }
}

let replies: Record<string, () => unknown>

function serve(me = fxAdmin) {
  GET.mockImplementation(async (path: string) => {
    if (path === '/api/admin/auth/me') return reply(200, me)
    const r = replies[path]
    return r ? r() : new Promise(() => {})
  })
}

function renderAt(path: string) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/*" element={<AdminRoutes />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  GET.mockReset()
  POST.mockReset()
  PUT.mockReset()
  replies = {
    '/api/admin/config': () => reply(200, fxConfigState),
    '/api/admin/config/catalog': () => reply(200, fxCatalog),
    '/api/admin/config/draft/knowledge/{section}': () => reply(200, fxRouting),
    '/api/admin/config/draft/agents': () => reply(200, fxAgents),
    '/api/admin/config/draft/forms': () => reply(200, fxForms),
    '/api/admin/config/draft/diff': () => reply(200, fxVersionDiff),
    '/api/admin/config/versions': () => reply(200, fxVersions),
    '/api/admin/config/versions/{seq}/diff': () => reply(200, fxVersionDiff),
  }
  serve()
})
afterEach(cleanup)

describe('T-FE: departments and knowledge pages', () => {
  it('shows departments on their own page with a help line and searchable rows', async () => {
    renderAt('/admin/departments')
    expect(await screen.findByTestId('admin-departments')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Departments' })).toBeInTheDocument()
    expect(screen.getByTestId('page-help')).toHaveTextContent('The departments callers can be sent to')
    const table = await screen.findByTestId('admin-table-knowledge-routing')
    expect(within(table).getByText('Fixture Department')).toBeInTheDocument()
    await userEvent.type(screen.getByTestId('routing-search'), 'zzz')
    expect(await screen.findByTestId('routing-nomatch')).toBeInTheDocument()
  })

  it('edits a department in a dialog and saves it', async () => {
    PUT.mockResolvedValue(reply(200, { name: 'knowledge.routing', value: fxRouting.value, draft_problems: [] }))
    renderAt('/admin/departments')
    await userEvent.click(await screen.findByTestId('routing-edit-fixture_dept'))
    const dialog = screen.getByTestId('routing-dialog')
    const title = within(dialog).getByTestId('routing-dialog-title')
    await userEvent.clear(title)
    await userEvent.type(title, 'Renamed Department')
    expect(within(dialog).getByTestId('routing-dialog-role')).toBeDisabled() // the key is fixed
    await userEvent.click(within(dialog).getByTestId('routing-dialog-confirm'))
    await userEvent.click(screen.getByTestId('knowledge-routing-save'))
    await waitFor(() => expect(PUT).toHaveBeenCalled())
    const body = PUT.mock.calls[0][1].body.value
    expect(body.roles[0].title).toBe('Renamed Department')
    expect(await screen.findByTestId('knowledge-routing-result')).toHaveTextContent('Saved. Make your changes live')
  })

  it('orders knowledge like the setup checklist, without departments', async () => {
    replies['/api/admin/config/draft/knowledge/{section}'] = () =>
      reply(200, { name: 'knowledge.hours', value: { status: 'UNAPPROVED', timezone: 'America/New_York', weekly: {}, closures: [] }, draft_problems: [] })
    renderAt('/admin/knowledge')
    const tabs = await screen.findByTestId('knowledge-tabs')
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Hours & closures',
      'Services',
      'Referrals',
      'Standard sentences',
      'Crisis words',
      'Never say',
      'Medical topics',
    ])
    expect(within(tabs).getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByTestId('knowledge-tab-routing')).toBeNull()
  })

  it('a reviewer reads everything and gets no edit controls and no changes bar', async () => {
    replies['/api/admin/config'] = () => reply(200, fxConfigReviewer)
    serve(fxReviewer)
    renderAt('/admin/departments')
    expect(await screen.findByTestId('admin-table-knowledge-routing')).toBeInTheDocument()
    expect(screen.queryByTestId('changes-bar')).toBeNull()
    expect(screen.queryByTestId('routing-add')).toBeNull()
    expect(screen.queryByTestId('knowledge-routing-save')).toBeNull()
  })

  it('shows built-in crisis words as always on, not removable', async () => {
    replies['/api/admin/config/draft/knowledge/{section}'] = () =>
      reply(200, { name: 'knowledge.crisis', value: { status: 'UNAPPROVED', keywords: { en: ['added phrase'], es: [] }, agency_keywords: {} }, draft_problems: [] })
    renderAt('/admin/knowledge?section=crisis')
    const en = await screen.findByTestId('crisis-en')
    expect(within(en).getByTestId('crisis-en-locked')).toHaveTextContent('fixture crisis phrase')
    expect(within(en).getAllByTestId('crisis-en-remove')).toHaveLength(1) // only the addition
  })

  it('shows a retryable error', async () => {
    replies['/api/admin/config/draft/knowledge/{section}'] = () => reply(500, { detail: 'boom' })
    renderAt('/admin/departments')
    expect(await screen.findByTestId('knowledge-routing-error')).toBeInTheDocument()
  })
})

describe('T-FE: history', () => {
  it('lists what went live with the live one marked, and shows a diff as plain text', async () => {
    renderAt('/admin/versions')
    expect(await screen.findByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument()
    expect(await screen.findByTestId('config-live-label')).toHaveTextContent('cfg-3-fx1a2b3c')
    const table = await screen.findByTestId('admin-table-versions')
    expect(within(table).getByText('cfg-3-fx1a2b3c')).toBeInTheDocument()
    expect(within(table).getByText('Went back')).toBeInTheDocument()
    cleanup()
    serve()
    renderAt('/admin/versions/2')
    const diff = await screen.findByTestId('version-diff-agents')
    expect(diff.querySelector('.admin-diff__line--add')).not.toBeNull()
    expect(diff.innerHTML).not.toContain('<script')
    expect(screen.getByTestId('version-rollback')).toBeInTheDocument()
  })
})
