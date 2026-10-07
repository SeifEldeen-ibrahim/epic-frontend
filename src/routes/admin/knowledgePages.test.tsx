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
  fxConfigProblems,
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

describe('T-FE: knowledge page', () => {
  it('shows the live version, the draft state and searchable routing rows', async () => {
    renderAt('/admin/knowledge')
    expect(await screen.findByTestId('config-live-label')).toHaveTextContent('cfg-3-fx1a2b3c')
    expect(screen.getByTestId('config-draft-state')).toHaveTextContent('2 sections changed')
    const table = await screen.findByTestId('admin-table-knowledge-routing')
    expect(within(table).getByText('Fixture Department')).toBeInTheDocument()
    await userEvent.type(screen.getByTestId('routing-search'), 'zzz')
    expect(await screen.findByTestId('routing-nomatch')).toBeInTheDocument()
  })

  it('edits a row in a dialog and saves the section to the draft', async () => {
    PUT.mockResolvedValue(reply(200, { name: 'knowledge.routing', value: fxRouting.value, draft_problems: [] }))
    renderAt('/admin/knowledge')
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
    expect(await screen.findByTestId('knowledge-routing-result')).toHaveTextContent('Saved to the draft.')
  })

  it('lists problems and disables publishing until they are fixed', async () => {
    replies['/api/admin/config'] = () => reply(200, fxConfigProblems)
    renderAt('/admin/knowledge')
    expect(await screen.findByTestId('config-problems')).toHaveTextContent('names something EPIC never collects')
    expect(screen.getByTestId('config-publish')).toBeDisabled()
  })

  it('publishes after confirming, and reports a stale draft', async () => {
    POST.mockResolvedValueOnce(reply(409, { detail: 'stale_draft' }))
    renderAt('/admin/knowledge')
    await userEvent.click(await screen.findByTestId('config-publish'))
    await userEvent.click(screen.getByTestId('config-confirm-confirm'))
    expect(await screen.findByTestId('config-result')).toHaveTextContent('Someone published since')
    POST.mockResolvedValueOnce(reply(200, { seq: 4, label: 'cfg-4-x', live_label: 'cfg-4-x' }))
    await userEvent.click(screen.getByTestId('config-publish'))
    await userEvent.click(screen.getByTestId('config-confirm-confirm'))
    await waitFor(() => expect(screen.getByTestId('config-result')).toHaveTextContent('cfg-4-x is live for new calls'))
  })

  it('a reviewer reads everything and gets no edit controls', async () => {
    replies['/api/admin/config'] = () => reply(200, fxConfigReviewer)
    serve(fxReviewer)
    renderAt('/admin/knowledge')
    expect(await screen.findByTestId('admin-table-knowledge-routing')).toBeInTheDocument()
    expect(screen.queryByTestId('config-publish')).toBeNull()
    expect(screen.queryByTestId('routing-add')).toBeNull()
    expect(screen.queryByTestId('knowledge-routing-save')).toBeNull()
  })

  it('shows locked floor entries that cannot be removed', async () => {
    replies['/api/admin/config/draft/knowledge/{section}'] = () =>
      reply(200, { name: 'knowledge.crisis', value: { status: 'UNAPPROVED', keywords: { en: ['added phrase'], es: [] }, agency_keywords: {} }, draft_problems: [] })
    renderAt('/admin/knowledge?section=crisis')
    const en = await screen.findByTestId('crisis-en')
    expect(within(en).getByTestId('crisis-en-locked')).toHaveTextContent('fixture crisis phrase')
    expect(within(en).getAllByTestId('crisis-en-remove')).toHaveLength(1) // only the addition
  })

  it('shows loading and a retryable error', async () => {
    replies['/api/admin/config/draft/knowledge/{section}'] = () => reply(500, { detail: 'boom' })
    renderAt('/admin/knowledge')
    expect(await screen.findByTestId('knowledge-routing-error')).toBeInTheDocument()
  })
})

describe('T-FE: versions', () => {
  it('lists versions with the live one marked, and shows a diff as plain text', async () => {
    renderAt('/admin/versions')
    const table = await screen.findByTestId('admin-table-versions')
    expect(within(table).getByText('cfg-3-fx1a2b3c')).toBeInTheDocument()
    expect(within(table).getByText('Rollback')).toBeInTheDocument()
    cleanup()
    serve()
    renderAt('/admin/versions/2')
    const diff = await screen.findByTestId('version-diff-agents')
    expect(diff.querySelector('.admin-diff__line--add')).not.toBeNull()
    expect(diff.innerHTML).not.toContain('<script')
    expect(screen.getByTestId('version-rollback')).toBeInTheDocument()
  })
})
