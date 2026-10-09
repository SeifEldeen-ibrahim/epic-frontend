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

describe('xxadminformsfixxx: adding a service saves, and refusals read plainly', () => {
  const services = {
    name: 'knowledge.services',
    value: {
      status: 'UNAPPROVED',
      services: [{ key: 'intake', name: 'Intake', aliases: [], description: 'New clients.', documents: null, wait_time: null, location: 'Main office', directions: 'Floor 1', source: 'site' }],
    },
    draft_problems: [],
  }
  beforeEach(() => {
    replies['/api/admin/config/draft/knowledge/{section}'] = () => reply(200, services)
  })

  it('marks required fields, keeps Save off until they are filled, and saves a row with blank optional fields', async () => {
    PUT.mockResolvedValue(reply(200, services))
    renderAt('/admin/knowledge?section=services')
    await userEvent.click(await screen.findByTestId('services-add'))
    const dialog = screen.getByTestId('services-dialog')
    const name = within(dialog).getByTestId('services-dialog-name')
    expect(name).toHaveAttribute('aria-required', 'true')
    expect(within(dialog).getByText('Name').closest('label')).toHaveTextContent('Name *Required')
    expect(within(dialog).getByTestId('services-dialog-location').closest('.ui-field')).toHaveTextContent('(optional)')
    expect(within(dialog).getByText('Note (where this info came from)').closest('label')).toHaveTextContent('(optional)')
    expect(within(dialog).getByTestId('services-dialog-confirm')).toBeDisabled()
    expect(within(dialog).getByTestId('services-dialog-missing')).toHaveTextContent('Fill in before saving: Name, Description, Key')
    await userEvent.type(name, 'Flu Shot Clinic')
    await userEvent.type(within(dialog).getByTestId('services-dialog-description'), 'Seasonal flu shots.')
    expect(within(dialog).getByTestId('services-dialog-key')).toHaveValue('flu_shot_clinic')
    expect(within(dialog).queryByTestId('services-dialog-missing')).toBeNull()
    await userEvent.click(within(dialog).getByTestId('services-dialog-confirm'))
    await userEvent.click(screen.getByTestId('knowledge-services-save'))
    await waitFor(() => expect(PUT).toHaveBeenCalled())
    const row = PUT.mock.calls[0][1].body.value.services[1]
    expect(row).toMatchObject({ key: 'flu_shot_clinic', name: 'Flu Shot Clinic', description: 'Seasonal flu shots.', location: '', directions: '', source: '', aliases: [] })
  }, 20_000)

  it('shows a 422 refusal per row and field in plain words, and under the field when the row is opened', async () => {
    PUT.mockResolvedValue(
      reply(422, { detail: { code: 'invalid', problems: [{ document: 'knowledge.services', path: 'services.0.source', message: 'missing' }] } }),
    )
    renderAt('/admin/knowledge?section=services')
    await userEvent.click(await screen.findByTestId('services-edit-intake'))
    const dialog = screen.getByTestId('services-dialog')
    await userEvent.type(within(dialog).getByTestId('services-dialog-name'), ' 2')
    await userEvent.click(within(dialog).getByTestId('services-dialog-confirm'))
    await userEvent.click(screen.getByTestId('knowledge-services-save'))
    const list = await screen.findByTestId('knowledge-services-problems')
    expect(list).toHaveTextContent('Row 1 (intake): Note is missing')
    expect(list).not.toHaveTextContent('services.0.source')
    expect(screen.getByTestId('knowledge-services-result')).not.toHaveTextContent('Check the values')
    await userEvent.click(screen.getByTestId('services-edit-intake'))
    const again = screen.getByTestId('services-dialog')
    expect(within(again).getByTestId('services-dialog-source')).toHaveAttribute('aria-invalid', 'true')
    expect(within(again).getByTestId('services-dialog-source').closest('.ui-field')).toHaveTextContent('Note is missing')
  }, 20_000)
})

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

  it('T-EDITORS: crisis keeps agency words (built-in ones locked) and links to the Language page; no Spanish lists', async () => {
    replies['/api/admin/config/draft/knowledge/{section}'] = () =>
      reply(200, { name: 'knowledge.crisis', value: { status: 'UNAPPROVED', agency_keywords: { fixture_agency: ['added word'] } }, draft_problems: [] })
    renderAt('/admin/knowledge?section=crisis')
    const agency = await screen.findByTestId('crisis-agency-fixture_agency')
    expect(within(agency).getByTestId('crisis-agency-fixture_agency-locked')).toHaveTextContent('FXA')
    expect(within(agency).getAllByTestId('crisis-agency-fixture_agency-remove')).toHaveLength(1) // only the addition
    const link = screen.getByTestId('crisis-languages-link')
    expect(link).toHaveTextContent('Crisis phrases for each language are on the Language page')
    expect(link).toHaveAttribute('href', '/admin/languages')
    expect(screen.queryByTestId('crisis-en')).toBeNull()
    expect(screen.queryByTestId('crisis-es')).toBeNull()
    expect(document.body).not.toHaveTextContent(/Spanish/)
  })

  it('T-EDITORS: the wording editor shows only the language-neutral fields, no _es labels', async () => {
    replies['/api/admin/config/draft/knowledge/{section}'] = () =>
      reply(200, {
        name: 'knowledge.wording',
        value: { status: 'UNAPPROVED', greeting: 'Hello, this call is recorded.', refusal_suffix: 'Say no kindly.', reconnect_greeting: 'Welcome back.', human_needed_es: 'stale' },
        draft_problems: [],
      })
    renderAt('/admin/knowledge?section=wording')
    expect(await screen.findByDisplayValue('Hello, this call is recorded.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Welcome back.')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('stale')).toBeNull()
    expect(document.body).not.toHaveTextContent(/Spanish|_es/)
  })

  it('shows a retryable error', async () => {
    replies['/api/admin/config/draft/knowledge/{section}'] = () => reply(500, { detail: 'boom' })
    renderAt('/admin/departments')
    expect(await screen.findByTestId('knowledge-routing-error')).toBeInTheDocument()
  })
})

describe('T-FE: history', () => {
  it('lists what went live as plain cards and opens a version without a text diff', async () => {
    renderAt('/admin/versions')
    expect(await screen.findByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument()
    const list = await screen.findByTestId('versions-list')
    expect(within(list).getByTestId('version-card-2')).toHaveTextContent('Went back on')
    expect(screen.queryByTestId('config-live-label')).toBeNull()
    cleanup()
    serve()
    renderAt('/admin/versions/2')
    expect(await screen.findByTestId('version-changes')).toBeInTheDocument()
    expect(document.querySelector('.admin-diff')).toBeNull()
    expect(screen.getByTestId('version-rollback')).toBeInTheDocument()
  })
})
