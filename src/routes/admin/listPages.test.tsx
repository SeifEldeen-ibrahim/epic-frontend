import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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

const admin = {
  id: '00000000-0000-4000-8000-000000000002',
  email: 'ada@example.test',
  display_name: 'Ada Admin',
  role: 'admin',
  must_change_password: false,
} as StaffMe

const CALL = '00000000-0000-4000-8000-0000000000c1'
const queueItem = {
  after_hours_queued: true,
  call_id: CALL,
  flag_counts: { open: 2, carried: 1, acknowledged: 0, resolved: 0 },
  form_id: '00000000-0000-4000-8000-0000000000f1',
  inquiry_category: 'new_client',
  language: 'en',
  route_role: 'intake',
  submitted_at: '2026-10-07T09:00:00Z',
}
const followItem = {
  call_id: CALL,
  ended_at: '2026-10-07T09:05:00Z',
  form_status: null,
  language: 'es',
  outcome: 'human_needed',
  started_at: '2026-10-07T09:00:00Z',
  stated_name: 'Fictional Fran',
  stated_reason: 'Wants a person',
}
const callItem = {
  agent_version: 'v-test-1',
  ended_at: null,
  follow_up_status: 'none',
  form_status: 'incomplete',
  id: CALL,
  inquiry_category: null,
  language: 'en',
  open_flags: 0,
  outcome: 'routed',
  route_role: 'intake',
  started_at: '2026-10-07T09:00:00Z',
  status: 'ended',
  tester_label: 'tester-a',
}
const reportsEmpty = {
  agent_version: null,
  date_from: '2026-09-07',
  date_to: '2026-10-07',
  delegation: [],
  gate_results: [],
  latency: [],
  outcomes: [],
  period: 'day',
  routing_mix: [],
  total_calls: 0,
  unmet_demand: [],
}
const reportsFull = {
  ...reportsEmpty,
  total_calls: 3,
  outcomes: [{ count: 3, inquiry_category: 'new_client', outcome: 'routed' }],
  routing_mix: [{ count: 3, route_role: 'intake' }],
  latency: [{ agent_version: 'v-test-1', p50_ms: 410, p90_ms: 900, turns: 12 }],
  delegation: [{ agent_version: 'v-test-1', p50_ms: 120, p90_ms: 300, actions: 4 }],
  unmet_demand: [{ category: 'billing', count: 1, period_start: '2026-10-06' }],
}
const pendingItem = {
  call_id: CALL,
  caller_relationship: 'self',
  decided_at: '2026-10-07T10:00:00Z',
  form_id: '00000000-0000-4000-8000-0000000000f2',
  inquiry_category: 'new_client',
  language: 'en',
  submitted_at: '2026-10-07T09:00:00Z',
}
const auditItem = {
  action: 'approve',
  actor: 'staff',
  at: '2026-10-07T10:00:00Z',
  id: 7,
  staff_email: 'ada@example.test',
  target: CALL,
}

type Handler = (init?: { params?: { query?: Record<string, unknown> } }) => unknown
let handlers: Record<string, Handler> = {}

function Probe() {
  const l = useLocation()
  return <div data-testid="location">{l.pathname + l.search}</div>
}

function renderAt(path: string) {
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

const calledPaths = (p: string) => GET.mock.calls.filter((c) => c[0] === p)

beforeEach(() => {
  handlers = {}
  GET.mockReset()
  POST.mockReset()
  GET.mockImplementation(async (path: string, init?: Parameters<Handler>[0]) => {
    if (path === '/api/admin/auth/me') return reply(200, admin)
    const h = handlers[path]
    return h ? h(init) : new Promise(() => {})
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const pages = [
  { page: 'queue', url: '/admin/queue', api: '/api/admin/queue', empty: { items: [] }, data: { items: [queueItem] }, text: 'No forms waiting.' },
  {
    page: 'follow-up',
    url: '/admin/follow-up',
    api: '/api/admin/follow-up',
    empty: { items: [] },
    data: { items: [followItem] },
    text: 'Nobody is waiting for a person.',
  },
  {
    page: 'calls',
    url: '/admin/calls',
    api: '/api/admin/calls',
    empty: { items: [], next_cursor: null },
    data: { items: [callItem], next_cursor: null },
    text: 'No calls yet',
  },
  {
    page: 'reports',
    url: '/admin/reports',
    api: '/api/admin/reports',
    empty: reportsEmpty,
    data: reportsFull,
    text: 'Not enough calls in this period',
    table: 'reports-outcomes',
  },
  {
    page: 'exports',
    url: '/admin/exports',
    api: '/api/admin/exports',
    empty: { items: [] },
    data: { items: [pendingItem] },
    text: 'Nothing approved since the last export',
  },
  {
    page: 'audit',
    url: '/admin/audit',
    api: '/api/admin/audit',
    empty: { items: [], next_cursor: null },
    data: { items: [auditItem], next_cursor: null },
    text: 'No audit entries yet',
  },
] as const

describe.each(pages)('$page page', (p) => {
  it('shows skeleton rows while loading', async () => {
    renderAt(p.url)
    const table = await screen.findByTestId(`${p.page}-loading`)
    expect(table).toHaveAttribute('aria-busy', 'true')
    expect(table.closest('[data-testid="admin-table-scroll"]')).not.toBeNull()
    expect(within(screen.getByTestId(`admin-${p.page}`)).getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('shows the empty state copy', async () => {
    handlers[p.api] = () => reply(200, p.empty)
    renderAt(p.url)
    expect(await screen.findByTestId(`${p.page}-empty`)).toHaveTextContent(p.text)
  })

  it('shows an error with retry', async () => {
    handlers[p.api] = () => reply(500, { detail: 'boom' })
    renderAt(p.url)
    const error = await screen.findByTestId(`${p.page}-error`)
    const before = calledPaths(p.api).length
    await userEvent.click(within(error).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(calledPaths(p.api).length).toBeGreaterThan(before))
  })

  it('shows data in a scrollable table', async () => {
    handlers[p.api] = () => reply(200, p.data)
    renderAt(p.url)
    const table = await screen.findByTestId(`admin-table-${'table' in p ? p.table : p.page}`)
    expect(table.closest('[data-testid="admin-table-scroll"]')).toHaveAttribute('tabindex', '0')
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1)
  })
})

describe('queue', () => {
  it('keeps rows and shows a stale notice when a refresh fails', async () => {
    let fail = false
    handlers['/api/admin/queue'] = () => (fail ? reply(500, { detail: 'down' }) : reply(200, { items: [queueItem] }))
    renderAt('/admin/queue')
    const table = await screen.findByTestId('admin-table-queue')
    expect(within(table).getByText('2 open, 1 carried')).toBeInTheDocument()
    expect(within(table).getByRole('link', { name: 'Open call' })).toHaveAttribute('href', `/admin/calls/${CALL}`)
    fail = true
    await userEvent.click(screen.getByTestId('queue-refresh'))
    expect(await screen.findByTestId('queue-stale')).toHaveTextContent(/Showing the queue from .* couldn't refresh\./)
    expect(screen.getByTestId('admin-table-queue')).toBeInTheDocument()
    expect(screen.queryByTestId('queue-error')).toBeNull()
  })
})

describe('calls', () => {
  it('says no calls match when filters are set', async () => {
    handlers['/api/admin/calls'] = () => reply(200, { items: [], next_cursor: null })
    renderAt('/admin/calls?outcome=crisis')
    expect(await screen.findByTestId('calls-filtered-empty')).toHaveTextContent('No calls match these filters')
    expect(screen.queryByTestId('calls-empty')).toBeNull()
  })

  it('writes filters to the URL and queries with them', async () => {
    handlers['/api/admin/calls'] = () => reply(200, { items: [callItem], next_cursor: 'c-2' })
    renderAt('/admin/calls')
    await screen.findByTestId('admin-table-calls')
    await userEvent.selectOptions(screen.getByTestId('calls-filter-outcome'), 'crisis')
    await userEvent.selectOptions(screen.getByTestId('calls-filter-form_status'), 'incomplete')
    await userEvent.type(screen.getByTestId('calls-filter-language'), 'es')
    await userEvent.click(screen.getByTestId('calls-apply'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('outcome=crisis'))
    expect(screen.getByTestId('location')).toHaveTextContent('form_status=incomplete')
    expect(screen.getByTestId('location')).toHaveTextContent('language=es')
    await waitFor(() =>
      expect(GET).toHaveBeenCalledWith('/api/admin/calls', {
        params: { query: expect.objectContaining({ outcome: 'crisis', form_status: 'incomplete', language: 'es' }) },
      }),
    )
    await userEvent.click(screen.getByTestId('calls-next'))
    await waitFor(() =>
      expect(GET).toHaveBeenCalledWith('/api/admin/calls', { params: { query: expect.objectContaining({ cursor: 'c-2' }) } }),
    )
    await userEvent.click(screen.getByTestId('calls-clear'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/admin\/calls$/))
  })
})

describe('follow-up', () => {
  it('shows reason and stated name; acknowledge removes the row and focuses the result', async () => {
    handlers['/api/admin/follow-up'] = () => reply(200, { items: [followItem] })
    POST.mockResolvedValue(reply(200, { call_id: CALL, follow_up_status: 'acknowledged' }))
    renderAt('/admin/follow-up')
    const table = await screen.findByTestId('admin-table-follow-up')
    expect(within(table).getByText('Human needed')).toBeInTheDocument()
    expect(within(table).getByText('Fictional Fran')).toBeInTheDocument()
    expect(within(table).getByText('Wants a person')).toBeInTheDocument()
    await userEvent.click(within(table).getByRole('button', { name: /^Acknowledge/ }))
    const result = await screen.findByTestId('follow-up-result')
    expect(result).toHaveTextContent('Marked as handled')
    await waitFor(() => expect(result).toHaveFocus())
    expect(screen.queryByText('Fictional Fran')).toBeNull()
    expect(screen.getByTestId('follow-up-empty')).toBeInTheDocument()
    expect(POST).toHaveBeenCalledWith('/api/admin/calls/{call_id}/follow-up/acknowledge', expect.anything())
  })

  it('on 409 says someone already handled it and refetches', async () => {
    handlers['/api/admin/follow-up'] = () => reply(200, { items: [followItem] })
    POST.mockResolvedValue(reply(409, { detail: 'already_acknowledged' }))
    renderAt('/admin/follow-up')
    await screen.findByTestId('admin-table-follow-up')
    const before = calledPaths('/api/admin/follow-up').length
    await userEvent.click(screen.getByRole('button', { name: /^Acknowledge/ }))
    expect(await screen.findByTestId('follow-up-result')).toHaveTextContent('Someone already handled this')
    await waitFor(() => expect(calledPaths('/api/admin/follow-up').length).toBeGreaterThan(before))
  })
})

describe('exports', () => {
  it('downloads csv and json, reports the count, then shows the empty state', async () => {
    let exported = false
    handlers['/api/admin/exports'] = () => reply(200, { items: exported ? [] : [pendingItem] })
    POST.mockImplementation(async () => {
      exported = true
      return reply(200, { count: 1, csv: '"form_id"\n"x"\n', exported_at: '2026-10-07T12:34:56.789Z', rows: [{ form_id: 'x' }] })
    })
    const created: Blob[] = []
    Object.assign(URL, {
      createObjectURL: vi.fn((b: Blob) => {
        created.push(b)
        return 'blob:fake'
      }),
      revokeObjectURL: vi.fn(),
    })
    const names: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download)
    })
    renderAt('/admin/exports')
    await screen.findByTestId('admin-table-exports')
    await userEvent.click(screen.getByTestId('exports-run'))
    expect(await screen.findByTestId('exports-result')).toHaveTextContent('Exported 1 form')
    expect(names).toHaveLength(2)
    for (const n of names) expect(n).toMatch(/^epic-export-.*\.(csv|json)$/)
    expect(names).toEqual(['epic-export-20261007T123456Z.csv', 'epic-export-20261007T123456Z.json'])
    expect(created.map((b) => b.type)).toEqual(['text/csv', 'application/json'])
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(await screen.findByTestId('exports-empty')).toHaveTextContent('Nothing approved since the last export')
    expect(screen.getByTestId('exports-run')).toBeDisabled()
  })
})

describe('reports', () => {
  it('shows not-enough-calls and the gate-results empty state', async () => {
    handlers['/api/admin/reports'] = () => reply(200, reportsEmpty)
    renderAt('/admin/reports')
    expect(await screen.findByTestId('reports-empty')).toHaveTextContent('Not enough calls in this period')
    expect(screen.getByRole('heading', { name: 'Release-gate and story-harness results' })).toBeInTheDocument()
    expect(screen.getByTestId('reports-gates-empty')).toHaveTextContent(
      'No gate results yet — they appear once the release-gate command publishes them',
    )
  })

  it('renders every report table when there are calls', async () => {
    handlers['/api/admin/reports'] = () => reply(200, reportsFull)
    renderAt('/admin/reports')
    for (const t of ['unmet', 'outcomes', 'routing', 'latency', 'delegation'])
      expect(await screen.findByTestId(`admin-table-reports-${t}`)).toBeInTheDocument()
    expect(screen.getByTestId('reports-gates-empty')).toBeInTheDocument()
  })
})
