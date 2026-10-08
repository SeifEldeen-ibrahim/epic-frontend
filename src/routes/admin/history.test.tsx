import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AdminRoutes } from '../../admin/AdminRoutes'
import {
  fxAdmin,
  fxCatalog,
  fxConfigClean,
  fxConfigReviewer,
  fxConfigState,
  fxReviewer,
  fxVersionDiff,
  fxVersionDiffEmpty,
  fxVersions,
  fxVersionsEmpty,
} from '../../admin/fixtures/data'
import { api } from '../../api/client'
import { createQueryClient } from '../../api/queryClient'

vi.mock('../../api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() } }))

const GET = vi.mocked(api.GET) as unknown as Mock
const POST = vi.mocked(api.POST) as unknown as Mock

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
  replies = {
    '/api/admin/config': () => reply(200, fxConfigState),
    '/api/admin/config/catalog': () => reply(200, fxCatalog),
    '/api/admin/config/draft/diff': () => reply(200, fxVersionDiff),
    '/api/admin/config/versions': () => reply(200, fxVersions),
    '/api/admin/config/versions/{seq}/diff': () => reply(200, fxVersionDiff),
  }
  serve()
})
afterEach(cleanup)

/** Visible text with the Advanced disclosure removed. */
function plainText(): string {
  const root = document.body.cloneNode(true) as HTMLElement
  root.querySelectorAll('[data-testid=version-advanced]').forEach((n) => n.remove())
  return root.textContent ?? ''
}

const JARGON = /\b(diff|seq|bundle|draft|json|yaml)\b|cfg-/i

describe('T-FE-HISTORY: the History list', () => {
  it('shows plain cards: who and when, the note, a Live now text badge on the live one, and a summary', async () => {
    renderAt('/admin/versions')
    const list = await screen.findByTestId('versions-list')
    const live = within(list).getByTestId('version-card-3')
    expect(live).toHaveTextContent('Made live on')
    expect(live).toHaveTextContent('by Fixture Admin (fictional)')
    expect(live).toHaveTextContent('Note: Fixture desk added')
    expect(within(live).getByTestId('version-live')).toHaveTextContent('Live now')
    expect(screen.getByTestId('version-summary-3')).toHaveTextContent('3 services added, department Fixture Intake changed, agent Fixture Receptionist changed')
    expect(within(list).getAllByTestId('version-live')).toHaveLength(1)
    expect(within(list).getByTestId('version-card-2')).toHaveTextContent('Went back on')
    expect(screen.getByTestId('version-summary-1')).toHaveTextContent('The first version of the setup.')
    expect(within(live).getByRole('link')).toHaveAttribute('href', '/admin/versions/3')
  })

  it('shows "Changes not live yet" only when there are unsaved-live changes, loading them on open', async () => {
    const user = userEvent.setup()
    renderAt('/admin/versions')
    const pending = await screen.findByTestId('versions-pending')
    expect(pending).toHaveTextContent('Changes not live yet')
    expect(screen.queryByTestId('pending-changes')).toBeNull()
    await user.click(within(pending).getByText('See what will change'))
    expect(await screen.findByTestId('pending-changes')).toHaveTextContent('Who answers calls')
    cleanup()
    replies['/api/admin/config'] = () => reply(200, fxConfigClean)
    serve()
    renderAt('/admin/versions')
    await screen.findByTestId('versions-list')
    expect(screen.queryByTestId('versions-pending')).toBeNull()
  })

  it('has states for no changes, a failed change load, an empty history and a failed history', async () => {
    const user = userEvent.setup()
    replies['/api/admin/config/draft/diff'] = () => reply(200, fxVersionDiffEmpty)
    renderAt('/admin/versions')
    await user.click(await screen.findByText('See what will change'))
    expect(await screen.findByTestId('pending-empty')).toHaveTextContent('No changes to show.')
    cleanup()
    replies['/api/admin/config/draft/diff'] = () => reply(500, { detail: 'x' })
    serve()
    renderAt('/admin/versions')
    await user.click(await screen.findByText('See what will change'))
    expect(await screen.findByTestId('pending-error')).toBeInTheDocument()
    cleanup()
    replies['/api/admin/config/versions'] = () => reply(200, fxVersionsEmpty)
    serve()
    renderAt('/admin/versions')
    expect(await screen.findByTestId('versions-empty')).toHaveTextContent('Nothing has gone live yet.')
    cleanup()
    replies['/api/admin/config/versions'] = () => reply(500, { detail: 'x' })
    serve()
    renderAt('/admin/versions')
    expect(await screen.findByTestId('versions-error')).toBeInTheDocument()
  })
})

describe('T-FE-HISTORY: one version', () => {
  it('lists what changed by page with Before → After in plain labels, never coloured diff lines', async () => {
    renderAt('/admin/versions/3')
    const changes = await screen.findByTestId('version-changes')
    expect(within(changes).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Who answers calls',
      'Knowledge',
      'Departments',
      'Forms',
      'Agents',
    ])
    const dept = screen.getByTestId('change-area-departments')
    expect(dept).toHaveTextContent('Handled by: Department message → changed to Agent: Fixture Intake')
    expect(dept).toHaveTextContent('Added: autism')
    const knowledge = screen.getByTestId('change-area-knowledge')
    expect(knowledge).toHaveTextContent('Services › Autism evaluation — Added')
    expect(knowledge).toHaveTextContent('Wait time: About 6 weeks')
    expect(knowledge).toHaveTextContent('Opening hours › Saturday: Closed → changed to 09:00–13:00')
    expect(screen.getByTestId('change-area-forms')).toHaveTextContent('Field “Preferred day”')
    const agents = screen.getByTestId('change-area-agents')
    expect(agents).toHaveTextContent('Voice: marin → changed to cedar')
    expect(within(agents).getByText('Before')).toBeInTheDocument()
    expect(within(agents).getByText('After')).toBeInTheDocument()
    expect(screen.getByTestId('version-compared')).toHaveTextContent('Compared with the version made live on')
    expect(document.querySelector('.admin-diff')).toBeNull()
  })

  it('keeps the reference under Advanced only (T-COPY-HISTORY)', async () => {
    renderAt('/admin/versions/3')
    await screen.findByTestId('version-changes')
    expect(screen.getByTestId('version-label')).toHaveTextContent('cfg-3-fx1a2b3c')
    const text = plainText()
    expect(text).toContain('What changed')
    expect(text).toContain('Made live on')
    expect(text).not.toMatch(JARGON)
    expect(text.split('\n').some((l) => /^\s*[+-]/.test(l))).toBe(false)
    cleanup()
    serve()
    renderAt('/admin/versions')
    await screen.findByTestId('versions-list')
    const list = plainText()
    expect(list).toContain('Made live on')
    expect(list).not.toMatch(JARGON)
  })

  it('says it is the first version when there is nothing before, and has an empty state', async () => {
    replies['/api/admin/config/versions/{seq}/diff'] = () => reply(200, { ...fxVersionDiffEmpty, compared_with: null })
    renderAt('/admin/versions/1')
    expect(await screen.findByTestId('version-compared')).toHaveTextContent('This is the first version')
    expect(screen.getByTestId('version-nochanges')).toHaveTextContent('No changes from the version before.')
  })

  it('goes back with a plain confirm, and hides the button on the live version and for non-admins', async () => {
    const user = userEvent.setup()
    POST.mockResolvedValue(reply(200, { seq: 4, label: 'cfg-4-x', live_label: 'cfg-4-x' }))
    renderAt('/admin/versions/2')
    await user.click(await screen.findByTestId('version-rollback'))
    expect(screen.getByTestId('version-rollback')).toHaveTextContent('Go back to this version')
    const dialog = screen.getByTestId('version-confirm')
    expect(dialog).toHaveTextContent('Go back to this version?')
    expect(dialog).toHaveTextContent("This makes this version live again as a new version. Calls already in progress aren't affected.")
    await user.click(within(dialog).getByRole('button', { name: 'Go back' }))
    await waitFor(() => expect(POST).toHaveBeenCalledWith('/api/admin/config/versions/{seq}/rollback', expect.objectContaining({ params: { path: { seq: 2 } } })))
    expect(await screen.findByTestId('version-result')).toHaveTextContent('This version is live again for new calls.')
    expect(screen.getByTestId('version-result')).not.toHaveTextContent('cfg-')
    cleanup()
    serve()
    renderAt('/admin/versions/3')
    await screen.findByTestId('version-changes')
    expect(screen.queryByTestId('version-rollback')).toBeNull()
    cleanup()
    replies['/api/admin/config'] = () => reply(200, fxConfigReviewer)
    serve(fxReviewer)
    renderAt('/admin/versions/2')
    await screen.findByTestId('version-changes')
    expect(screen.queryByTestId('version-rollback')).toBeNull()
  })

  it('shows not-found and error states', async () => {
    replies['/api/admin/config/versions/{seq}/diff'] = () => reply(404, { detail: 'not_found' })
    renderAt('/admin/versions/99')
    expect(await screen.findByTestId('version-not-found')).toHaveTextContent('There is no such version.')
  })
})
