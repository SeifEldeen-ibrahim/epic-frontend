import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
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
const FLAG = '00000000-0000-4000-8000-0000000000a1'
const DETAIL = '/api/admin/calls/{call_id}'
const P = {
  fields: '/api/admin/calls/{call_id}/form/fields',
  approve: '/api/admin/calls/{call_id}/form/approve',
  reject: '/api/admin/calls/{call_id}/form/reject',
  ack: '/api/admin/calls/{call_id}/flags/{flag_id}/acknowledge',
}

const baseCall = {
  after_hours: false,
  agent_version: 'v-test-1',
  voice_mode: 'gpt-live',
  channel: 'phone',
  clarify_turns: 0,
  ended_at: '2026-10-07T09:05:00Z',
  follow_up_status: 'none',
  id: CALL,
  inquiry_category: 'new_client',
  language: 'en',
  outcome: 'clinic_form',
  route_role: 'intake',
  started_at: '2026-10-07T09:00:00Z',
  stated_name: 'Fictional Fran',
  stated_reason: 'New appointment',
  status: 'ended',
  tester_label: 'tester-a',
}
const baseForm = {
  after_hours_queued: false,
  callback_consent: true,
  callback_number: '555-0100',
  caller_relationship: 'self',
  decided_at: null,
  decided_by_email: null,
  documents_held: ['id card'],
  exported_at: null,
  fields: { dob: '1990-01-01', visits: 3 },
  id: '00000000-0000-4000-8000-0000000000f1',
  insurance_carrier_verbatim: 'Fictional Mutual',
  reject_reason: null,
  schema_version: '1',
  status: 'awaiting_approval',
  submitted_at: '2026-10-07T09:04:00Z',
}
const openFlag = {
  at: '2026-10-07T09:00:30Z',
  created_at: '2026-10-07T09:00:30Z',
  detail: 'Spelling unsure',
  entry_type: 'flag',
  form_field: 'caller_relationship',
  id: FLAG,
  kind: 'typo',
  resolved_at: null,
  resolved_by: null,
  status: 'open',
}
const ackedFlag = { ...openFlag, status: 'acknowledged', resolved_at: '2026-10-07T10:00:00Z', resolved_by: 'staff' }
// Deliberately out of order: the page must sort by `at`.
const scrambled = [
  openFlag,
  { at: '2026-10-07T09:00:05Z', ended_at: null, entry_type: 'turn', language: 'en', latency_ms: 420, seq: 2, speaker: 'agent', started_at: '2026-10-07T09:00:05Z', text: 'How can I help?' },
  { at: '2026-10-07T09:00:10Z', created_at: '2026-10-07T09:00:10Z', delegation_ms: 130, entry_type: 'action', id: 'act-1', kind: 'handoff', name: 'clinic' },
  { at: '2026-10-07T09:00:02Z', ended_at: null, entry_type: 'turn', language: 'en', latency_ms: null, seq: 1, speaker: 'caller', started_at: '2026-10-07T09:00:02Z', text: 'Hello there' },
]

function detail(over: { call?: object; form?: object | null; timeline?: object[]; recording?: object } = {}) {
  return {
    call: { ...baseCall, ...over.call },
    sessions: [{ agent_package: 'switchboard', end_reason: 'handoff', ended_at: null, seq: 1, started_at: baseCall.started_at, voice: 'alloy' }],
    timeline: over.timeline ?? scrambled,
    form: over.form === null ? null : { ...baseForm, ...over.form },
    field_history: [{ at: '2026-10-07T09:03:00Z', field: 'callback_number', old: null, new: '555-0100', source: 'agent', staff_email: null }],
    recording: { available: true, missing: 0, reason: null, segments: 2, total_bytes: 1000, ...over.recording },
  }
}

let detailReply: () => unknown
let postHandlers: Record<string, (init: unknown) => unknown>

function renderPage() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/admin/calls/${CALL}`]}>
        <Routes>
          <Route path="/admin/*" element={<AdminRoutes />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const detailCalls = () => GET.mock.calls.filter((c) => c[0] === DETAIL).length

beforeEach(() => {
  detailReply = () => reply(200, detail())
  postHandlers = {}
  GET.mockReset()
  POST.mockReset()
  GET.mockImplementation(async (path: string) => {
    if (path === '/api/admin/auth/me') return reply(200, admin)
    if (path === DETAIL) return detailReply()
    return new Promise(() => {})
  })
  POST.mockImplementation(async (path: string, init: unknown) => {
    const h = postHandlers[path]
    return h ? h(init) : reply(500, { detail: 'unexpected' })
  })
})

afterEach(() => cleanup())

describe('call detail page', () => {
  it('shows a skeleton that reserves space while loading', async () => {
    detailReply = () => new Promise(() => {})
    renderPage()
    const skeleton = await screen.findByTestId('detail-loading')
    expect(skeleton).toHaveAttribute('aria-busy', 'true')
    expect(skeleton.querySelectorAll('.admin-detail__placeholder')).toHaveLength(4)
  })

  it('renders the timeline in time order with latency, independent of the recording', async () => {
    renderPage()
    const timeline = await screen.findByTestId('detail-timeline')
    expect(timeline).toHaveAttribute('id', 'transcript')
    const items = within(timeline).getAllByRole('listitem').filter((li) => li.dataset.testid?.startsWith('timeline-'))
    expect(items.map((li) => li.dataset.testid)).toEqual(['timeline-turn', 'timeline-turn', 'timeline-action', 'timeline-flag'])
    expect(items[0]).toHaveTextContent('Caller')
    expect(items[0]).toHaveTextContent('Hello there')
    expect(items[1]).toHaveTextContent('Agent')
    expect(items[1]).toHaveTextContent('latency 420 ms')
    expect(items[2]).toHaveTextContent('delegation 130 ms')
    expect(items[3]).toHaveTextContent('Spelling unsure')
    expect(within(timeline).getByTestId('detail-sessions')).toHaveTextContent('Session 1')
    const audio = screen.getByTestId('detail-audio')
    expect(audio).toHaveAttribute('preload', 'none')
    expect(screen.getByLabelText('Call recording')).toBe(audio)
    expect(audio).toHaveAttribute('src', `/api/admin/calls/${CALL}/recording`)
    // Nothing fetched the recording: only the session and the detail were requested.
    expect(GET.mock.calls.every((c) => !String(c[0]).includes('recording'))).toBe(true)
    // Mobile order in the DOM: header, form, recording, timeline.
    const ids = [...screen.getByTestId('admin-call-detail').querySelectorAll('[data-testid^="detail-"]')]
      .map((el) => el.getAttribute('data-testid'))
      .filter((id) => ['detail-header', 'detail-form', 'detail-recording', 'detail-timeline'].includes(id ?? ''))
    expect(ids).toEqual(['detail-header', 'detail-form', 'detail-recording', 'detail-timeline'])
    expect(screen.getByTestId('detail-jump')).toHaveAttribute('href', '#transcript')
  })

  it('explains a missing form and shows the recording reason as text', async () => {
    detailReply = () =>
      reply(200, detail({ form: null, call: { outcome: 'human_needed' }, recording: { available: false, reason: 'no segments uploaded' } }))
    renderPage()
    expect(await screen.findByTestId('detail-no-form')).toHaveTextContent('No form — this call ended as human needed')
    expect(screen.getByTestId('detail-recording-unavailable')).toHaveTextContent('Recording unavailable — no segments uploaded')
    expect(screen.queryByTestId('detail-audio')).toBeNull()
    expect(screen.getByTestId('detail-timeline')).toBeInTheDocument()
  })

  it('shows the voice mode and keeps the player for a GPT-Live call', async () => {
    renderPage()
    expect(await screen.findByTestId('call-voice-mode')).toHaveTextContent('GPT-Live + Luna')
    expect(screen.getByTestId('detail-audio')).toBeInTheDocument()
    expect(screen.queryByTestId('call-no-recording-realtime')).toBeNull()
  })

  it('shows a Realtime call as not recorded, without a player', async () => {
    detailReply = () =>
      reply(200, detail({ call: { voice_mode: 'realtime', agent_version: 'v-test-1+rt-abc123' }, recording: { available: false, segments: 0 } }))
    renderPage()
    expect(await screen.findByTestId('call-voice-mode')).toHaveTextContent('Realtime (no Luna)')
    expect(screen.getByTestId('call-no-recording-realtime')).toHaveTextContent('No recording (Realtime mode)')
    expect(screen.queryByTestId('detail-audio')).toBeNull()
    expect(screen.queryByTestId('detail-recording-unavailable')).toBeNull()
  })

  it('shows an older call without a voice mode as GPT-Live', async () => {
    detailReply = () => reply(200, detail({ call: { voice_mode: undefined } }))
    renderPage()
    expect(await screen.findByTestId('call-voice-mode')).toHaveTextContent('GPT-Live + Luna')
  })

  it('makes a live call read-only with no action buttons', async () => {
    detailReply = () => reply(200, detail({ call: { status: 'live', ended_at: null, outcome: null } }))
    renderPage()
    expect(await screen.findByTestId('detail-live')).toHaveTextContent('In progress — read-only')
    const page = screen.getByTestId('admin-call-detail')
    expect(within(page).queryAllByRole('button')).toHaveLength(0)
    expect(within(page).queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryByTestId(`flag-ack-${FLAG}`)).toBeNull()
  })

  it('blocks approve while a flag is open, then approves after acknowledging', async () => {
    postHandlers[P.ack] = () => reply(200, ackedFlag)
    postHandlers[P.approve] = () => reply(200, { ...baseForm, status: 'approved', decided_at: '2026-10-07T10:01:00Z', decided_by_email: admin.email })
    const user = userEvent.setup()
    renderPage()
    const approve = await screen.findByTestId('form-approve')
    expect(approve).toBeDisabled()
    const hint = screen.getByTestId('form-approve-hint')
    expect(hint).toHaveTextContent('Acknowledge the flags first')
    expect(approve).toHaveAttribute('aria-describedby', hint.id)

    await user.click(screen.getByTestId(`flag-ack-${FLAG}`))
    await waitFor(() => expect(screen.getByTestId('detail-result')).toHaveFocus())
    expect(screen.getByTestId('detail-result')).toHaveTextContent('Flag acknowledged')
    expect(POST).toHaveBeenCalledWith(P.ack, expect.objectContaining({ params: { path: { call_id: CALL, flag_id: FLAG } } }))
    expect(screen.getByTestId('form-approve')).toBeEnabled()
    expect(screen.getByTestId('form-approve')).not.toHaveAttribute('aria-describedby')

    await user.click(screen.getByTestId('form-approve'))
    await waitFor(() => expect(screen.getByTestId('detail-result')).toHaveTextContent('Form approved'))
    expect(screen.getByTestId('detail-result')).toHaveFocus()
    expect(screen.queryByTestId('form-approve')).toBeNull()
  })

  it('requires a reason to reject', async () => {
    postHandlers[P.reject] = () => reply(200, { ...baseForm, status: 'rejected', reject_reason: 'Wrong caller' })
    detailReply = () => reply(200, detail({ timeline: [] }))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByTestId('form-reject'))
    const reason = screen.getByTestId('form-reject-reason')
    expect(reason).toBeRequired()
    expect(reason).toHaveAttribute('maxlength', '500')
    await user.click(screen.getByTestId('form-reject-confirm'))
    expect(screen.getByTestId('form-reject-error')).toHaveTextContent('Enter a reason')
    expect(reason).toHaveAttribute('aria-invalid', 'true')
    expect(POST).not.toHaveBeenCalled()
    await user.type(reason, 'Wrong caller')
    await user.click(screen.getByTestId('form-reject-confirm'))
    await waitFor(() => expect(screen.getByTestId('detail-result')).toHaveTextContent('Form rejected'))
    expect(POST).toHaveBeenCalledWith(P.reject, expect.objectContaining({ body: { reason: 'Wrong caller' } }))
    expect(screen.getByTestId('detail-reject-reason')).toHaveTextContent('Wrong caller')
  })

  it('saves an edit with the old value and shows it in the history', async () => {
    postHandlers[P.fields] = () => reply(200, { ...baseForm, caller_relationship: 'parent' })
    const user = userEvent.setup()
    renderPage()
    const input = await screen.findByTestId('field-caller_relationship')
    await user.clear(input)
    await user.type(input, 'parent')
    await user.click(screen.getByTestId('field-save-caller_relationship'))
    await waitFor(() => expect(screen.getByTestId('detail-result')).toHaveFocus())
    expect(POST).toHaveBeenCalledWith(
      P.fields,
      expect.objectContaining({ body: { field: 'caller_relationship', old: 'self', new: 'parent' } }),
    )
    const history = screen.getByTestId('detail-history')
    expect(history).toHaveTextContent('Callback number: — → 555-0100')
    expect(history).toHaveTextContent('Caller relationship: self → parent')
    expect(history).toHaveTextContent('ada@example.test')
    expect(screen.getByTestId('field-caller_relationship')).toHaveValue('parent')
  })

  it('renders an admin-built form from its definition: labels, order and typed editors', async () => {
    const generic = {
            schema_version: 'fixture_form@cfg-3-abc',
            caller_relationship: null,
            insurance_carrier_verbatim: null,
            documents_held: null,
            fields: { preferred_day: 'tuesday', visits: 3 },
            definition: {
              name: 'fixture_form',
              title: 'Fixture request',
              fields: [
                { key: 'preferred_day', label: 'Preferred day', type: 'enum', required: true, values: ['monday', 'tuesday'], readback_label: '' },
                { key: 'visits', label: 'Visits so far', type: 'number', required: false, values: [], readback_label: '' },
              ],
            },
    }
    detailReply = () => reply(200, detail({ form: generic }))
    postHandlers[P.fields] = () => reply(200, { ...baseForm, ...generic })
    const user = userEvent.setup()
    renderPage()
    const day = await screen.findByTestId('field-preferred_day')
    expect(day.tagName).toBe('SELECT')
    expect(day).toHaveValue('tuesday')
    expect(screen.getByText('Visits so far')).toBeInTheDocument()
    expect(screen.queryByTestId('field-insurance_carrier_verbatim')).toBeNull() // not in this form
    expect(screen.getByTestId('field-callback_number')).toBeInTheDocument() // the callback block stays
    await user.selectOptions(day, 'monday')
    await user.click(screen.getByTestId('field-save-preferred_day'))
    expect(POST).toHaveBeenCalledWith(
      P.fields,
      expect.objectContaining({ body: { field: 'preferred_day', old: 'tuesday', new: 'monday' } }),
    )
    await user.clear(screen.getByTestId('field-visits'))
    await user.type(screen.getByTestId('field-visits'), '4')
    await user.click(screen.getByTestId('field-save-visits'))
    expect(POST).toHaveBeenCalledWith(P.fields, expect.objectContaining({ body: { field: 'visits', old: 3, new: 4 } }))
  })

  it('sends typed values for the list and checkbox fields', async () => {
    postHandlers[P.fields] = () => reply(200, baseForm)
    const user = userEvent.setup()
    renderPage()
    const docs = await screen.findByTestId('field-documents_held')
    await user.clear(docs)
    await user.type(docs, 'id card, insurance card')
    await user.click(screen.getByTestId('field-save-documents_held'))
    expect(POST).toHaveBeenCalledWith(
      P.fields,
      expect.objectContaining({ body: { field: 'documents_held', old: ['id card'], new: ['id card', 'insurance card'] } }),
    )
    await user.click(screen.getByTestId('field-callback_consent'))
    await user.click(screen.getByTestId('field-save-callback_consent'))
    expect(POST).toHaveBeenCalledWith(
      P.fields,
      expect.objectContaining({ body: { field: 'callback_consent', old: true, new: false } }),
    )
    expect(screen.queryByTestId('field-visits')).toBeNull()
    expect(screen.getByTestId('field-dob')).toHaveValue('1990-01-01')
  })

  it('shows the conflict notice and refetches on 409', async () => {
    postHandlers[P.approve] = () => reply(409, { detail: 'form_changed' })
    detailReply = () => reply(200, detail({ timeline: [] }))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByTestId('form-approve'))
    const notice = await screen.findByTestId('detail-conflict')
    expect(notice).toHaveTextContent('Someone else changed this form — showing the latest')
    await waitFor(() => expect(notice).toHaveFocus())
    await waitFor(() => expect(detailCalls()).toBe(2))
  })

  it('shows not-found for 404', async () => {
    detailReply = () => reply(404, { detail: 'not_found' })
    renderPage()
    const nf = await screen.findByTestId('detail-not-found')
    expect(nf).toHaveTextContent("This call doesn't exist")
    expect(within(nf).getByRole('link')).toHaveAttribute('href', '/admin/calls')
    expect(screen.queryByTestId('detail-error')).toBeNull()
  })

  it('offers a retry for a server error', async () => {
    let fail = true
    detailReply = () => (fail ? reply(503, { detail: 'down' }) : reply(200, detail()))
    const user = userEvent.setup()
    renderPage()
    const error = await screen.findByTestId('detail-error')
    expect(screen.queryByTestId('detail-not-found')).toBeNull()
    fail = false
    await user.click(within(error).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByTestId('detail-header')).toHaveTextContent('Fictional Fran')
  })

  it('reaches every control with the keyboard in DOM order', async () => {
    detailReply = () => reply(200, detail({ timeline: [ackedFlag], recording: { available: false, reason: 'none saved' } }))
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('detail-header')
    const focused = () => document.activeElement?.getAttribute('data-testid')
    for (let i = 0; i < 40 && focused() !== 'detail-jump'; i++) await user.tab()
    expect(focused()).toBe('detail-jump')
    const seen: (string | null | undefined)[] = []
    const fields = ['caller_relationship', 'insurance_carrier_verbatim', 'callback_number', 'callback_consent', 'documents_held', 'dob']
    const expected = [...fields.flatMap((f) => [`field-${f}`, `field-save-${f}`]), 'form-approve', 'form-reject']
    for (let i = 0; i < expected.length; i++) {
      await user.tab()
      seen.push(focused())
    }
    expect(seen).toEqual(expected)
  })

  it('reaches the flag acknowledge button after the form controls', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('detail-header')
    const focused = () => document.activeElement?.getAttribute('data-testid')
    for (let i = 0; i < 60 && focused() !== 'form-reject'; i++) await user.tab()
    expect(focused()).toBe('form-reject')
    await user.tab()
    expect(focused()).toBe(`flag-ack-${FLAG}`)
  })
})
