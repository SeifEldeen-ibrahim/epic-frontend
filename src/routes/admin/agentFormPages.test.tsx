import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AdminRoutes } from '../../admin/AdminRoutes'
import {
  fxAdmin,
  fxAgentDesk,
  fxAgents,
  fxAgentSwitchboard,
  fxCatalog,
  fxCompiled,
  fxConfigReviewer,
  fxConfigState,
  fxForm,
  fxForms,
  fxFormsEmpty,
  fxLanguageCatalog,
  fxReviewer,
  fxRouting,
} from '../../admin/fixtures/data'
import { api } from '../../api/client'
import { createQueryClient } from '../../api/queryClient'

vi.mock('../../api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() } }))

const GET = vi.mocked(api.GET) as unknown as Mock
const PUT = vi.mocked(api.PUT) as unknown as Mock

function reply(status: number, body: object) {
  const ok = status < 400
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status } }
}

let replies: Record<string, (init?: { params?: { path?: Record<string, string> } }) => unknown>

function serve(me = fxAdmin) {
  GET.mockImplementation(async (path: string, init?: { params?: { path?: Record<string, string> } }) => {
    if (path === '/api/admin/auth/me') return reply(200, me)
    const r = replies[path]
    return r ? r(init) : new Promise(() => {})
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
  PUT.mockReset()
  replies = {
    '/api/admin/config': () => reply(200, fxConfigState),
    '/api/admin/config/catalog': () => reply(200, fxCatalog),
    '/api/admin/config/draft/knowledge/{section}': () => reply(200, fxRouting),
    '/api/admin/config/draft/agents': () => reply(200, fxAgents),
    '/api/admin/config/draft/forms': () => reply(200, fxForms),
    '/api/admin/config/draft/agents/{name}': (init) =>
      init?.params?.path?.name === 'switchboard' ? reply(200, fxAgentSwitchboard) : init?.params?.path?.name === 'fixture_desk' ? reply(200, fxAgentDesk) : reply(404, { detail: 'not_found' }),
    '/api/admin/config/draft/agents/{name}/compiled': () => reply(200, fxCompiled),
    '/api/admin/config/languages/catalog': () => reply(200, fxLanguageCatalog),
    '/api/admin/config/draft/forms/{name}': () => reply(200, fxForm),
  }
  serve()
})
afterEach(cleanup)

describe('T-FE: agents', () => {
  it('lists agents with the entry agent and opens the new-agent editor', async () => {
    renderAt('/admin/agents')
    const table = await screen.findByTestId('admin-table-agents')
    expect(within(table).getByText('Fixture Desk')).toBeInTheDocument()
    expect(screen.getByTestId('agents-entry-select')).toHaveValue('switchboard')
    await userEvent.click(screen.getByTestId('agents-new'))
    expect(await screen.findByTestId('agent-name')).toBeInTheDocument()
  })

  it('edits plain inputs only; end_call is locked; form tools go together with a form picker', async () => {
    renderAt('/admin/agents/fixture_desk')
    expect(await screen.findByTestId('agent-persona')).toHaveValue('A fictional desk used for screenshots. Friendly and brief.')
    expect(screen.queryByText(/prompt\.md|luna\.md/)).toBeNull()
    expect(screen.getByTestId('agent-tool-end_call')).toBeChecked()
    expect(screen.getByTestId('agent-tool-end_call')).toBeDisabled()
    expect(screen.getByTestId('agent-tool-form')).toBeChecked()
    expect(screen.getByTestId('agent-form')).toHaveValue('fixture_form')
    await userEvent.click(screen.getByTestId('agent-tool-form'))
    expect(screen.queryByTestId('agent-form')).toBeNull()
    await userEvent.click(screen.getByTestId('agent-tool-route_to'))
    const targets = screen.getByTestId('agent-targets')
    expect(within(targets).getByTestId('agent-target-fixture_dept')).toBeInTheDocument()
    expect(within(targets).queryByTestId('agent-target-fixture_desk')).toBeNull() // never itself
    await userEvent.click(within(targets).getByTestId('agent-target-fixture_dept'))
    PUT.mockResolvedValue(reply(200, { name: 'agents.fixture_desk', value: {}, draft_problems: [] }))
    await userEvent.click(screen.getByTestId('agent-save'))
    await waitFor(() => expect(PUT).toHaveBeenCalled())
    const body = PUT.mock.calls[0][1].body.value
    expect(body.tools).toEqual(expect.arrayContaining(['route_to', 'end_call']))
    expect(body.tools).not.toContain('save_fields')
    expect(body.route_targets).toEqual(['fixture_dept'])
    expect(body.form).toBeNull()
    expect(Object.keys(body)).not.toContain('prompt')
  })

  it('xxclinicbookingxx: Appointments tools are their own group; checked ones are saved; other groups are unchanged', async () => {
    renderAt('/admin/agents/fixture_desk')
    const booking = await screen.findByTestId('agent-tools-booking')
    expect(within(booking).getByText('Appointments')).toBeInTheDocument()
    expect(within(booking).getByText('Let this agent check who the caller is and manage their clinic appointments.')).toBeInTheDocument()
    const names = ['verify_patient', 'find_slots', 'book_appointment', 'list_my_appointments', 'reschedule_appointment', 'cancel_appointment']
    expect(within(booking).getAllByRole('checkbox')).toHaveLength(6)
    for (const n of names) {
      expect(within(booking).getByTestId(`agent-tool-${n}`)).not.toBeChecked()
      expect(within(booking).getByTestId(`agent-tool-${n}`)).not.toBeDisabled()
    }
    // the other groups render as before, outside the Appointments group
    for (const id of ['agent-tool-route_to', 'agent-tool-give_referral', 'agent-tool-lookup_service', 'agent-tool-form', 'agent-tool-end_call']) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
      expect(within(booking).queryByTestId(id)).toBeNull()
    }
    expect(screen.getByTestId('agent-tool-form')).toBeChecked()
    expect(screen.getByTestId('agent-tool-end_call')).toBeChecked()
    expect(screen.getByTestId('agent-tool-end_call')).toBeDisabled()
    await userEvent.click(screen.getByTestId('agent-tool-verify_patient'))
    await userEvent.click(screen.getByTestId('agent-tool-book_appointment'))
    PUT.mockResolvedValue(reply(200, { name: 'agents.fixture_desk', value: {}, draft_problems: [] }))
    await userEvent.click(screen.getByTestId('agent-save'))
    await waitFor(() => expect(PUT).toHaveBeenCalled())
    const body = PUT.mock.calls[0][1].body.value
    expect(body.tools).toEqual(expect.arrayContaining(['verify_patient', 'book_appointment', 'save_fields', 'confirm_callback', 'submit_form', 'end_call']))
    expect(body.tools).not.toContain('find_slots')
    expect(body.tools).not.toContain('cancel_appointment')
  })

  it('T-EDITORS: the agent editor keeps the English handoff line and shows other languages with a link', async () => {
    replies['/api/admin/config/draft/agents'] = () =>
      reply(200, { ...fxAgents, agents: fxAgents.agents.map((a) => (a.name === 'fixture_desk' ? { ...a, other_languages: [{ code: 'es', filled: true }, { code: 'ar', filled: false }] } : a)) })
    renderAt('/admin/agents/fixture_desk')
    expect(await screen.findByTestId('agent-bridge')).toBeInTheDocument()
    expect(screen.queryByTestId('agent-bridge-es')).toBeNull()
    expect(screen.getByTestId('agent-handoff')).not.toHaveTextContent(/\(Spanish\)/)
    const note = screen.getByTestId('agent-other-languages')
    await waitFor(() => expect(note).toHaveTextContent('Other languages: Spanish ✓ filled, Arabic ✗ not filled yet, on the Language page'))
    expect(within(note).getByTestId('agent-other-es').querySelector('.admin-sr-only')).toHaveTextContent('filled')
    expect(within(note).getByRole('link', { name: 'on the Language page' })).toHaveAttribute('href', '/admin/languages')
  })

  it('opens switchboard in the same editor with every tool editable', async () => {
    renderAt('/admin/agents/switchboard')
    expect(await screen.findByTestId('agent-tool-route_to')).not.toBeDisabled()
    expect(screen.getByTestId('agent-tool-route_to')).toBeChecked()
  })

  it('keeps what the assistant is told in a collapsed Advanced section', async () => {
    renderAt('/admin/agents/fixture_desk')
    const details = await screen.findByTestId('agent-compiled')
    expect(details).not.toHaveAttribute('open')
    await userEvent.click(within(details).getByText('Advanced: what the assistant is told'))
    expect(await screen.findByTestId('agent-compiled-prompt')).toHaveTextContent("You are the clinic's Fixture Desk")
  })

  it('a reviewer sees the agent without save controls', async () => {
    replies['/api/admin/config'] = () => reply(200, fxConfigReviewer)
    serve(fxReviewer)
    renderAt('/admin/agents/fixture_desk')
    expect(await screen.findByTestId('agent-persona')).toBeDisabled()
    expect(screen.queryByTestId('agent-save')).toBeNull()
  })

  it('pickers say what is missing and link to create it', async () => {
    replies['/api/admin/config/draft/knowledge/{section}'] = () =>
      reply(200, { name: 'knowledge.routing', value: { status: 'UNAPPROVED', entitlement_words: [], roles: [] }, draft_problems: [] })
    replies['/api/admin/config/draft/forms'] = () => reply(200, fxFormsEmpty)
    renderAt('/admin/agents/new')
    await userEvent.click(await screen.findByTestId('agent-tool-route_to'))
    const targets = screen.getByTestId('agent-targets')
    expect(within(targets).getByText('Where can this agent send callers? — Departments and agents')).toBeInTheDocument()
    expect(within(targets).getByTestId('agent-targets-empty')).toHaveTextContent('No departments or agents to send callers to yet.')
    expect(within(targets).getByRole('link', { name: 'Add a department' })).toHaveAttribute('href', '/admin/departments')
    await userEvent.click(screen.getByTestId('agent-tool-form'))
    expect(screen.getByTestId('agent-form-empty')).toHaveTextContent('No forms yet.')
    expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/admin/forms/new')
    expect(screen.queryByTestId('agent-form')).toBeNull()
  })

  it('with no assistants, offers only to create the first one (the example setup lives on Home)', async () => {
    replies['/api/admin/config/draft/agents'] = () => reply(200, { agents: [], entry_agent: null })
    renderAt('/admin/agents')
    const empty = await screen.findByTestId('agents-empty')
    expect(empty).toHaveTextContent('Create your first assistant')
    expect(within(empty).getByTestId('agents-empty-new')).toHaveTextContent('Create your first agent')
    expect(within(empty).queryByTestId('load-example')).toBeNull()
    expect(screen.queryByTestId('load-example')).toBeNull()
  })

  it('can set nobody to answer calls', async () => {
    PUT.mockResolvedValue(reply(200, { name: 'entry_agent', value: null, draft_problems: [] }))
    renderAt('/admin/agents')
    const select = await screen.findByTestId('agents-entry-select')
    await userEvent.selectOptions(select, '')
    await userEvent.click(screen.getByTestId('agents-entry-save'))
    await waitFor(() => expect(PUT).toHaveBeenCalled())
    expect(PUT.mock.calls[0][1].body).toEqual({ value: null })
  })

  it('an unknown agent shows not found', async () => {
    renderAt('/admin/agents/nobody_here')
    expect(await screen.findByTestId('agent-not-found')).toBeInTheDocument()
  })
})

describe('T-FE: form builder', () => {
  it('lists forms and shows the empty state', async () => {
    renderAt('/admin/forms')
    expect(await screen.findByTestId('admin-table-forms')).toHaveTextContent('Fixture request')
    cleanup()
    replies['/api/admin/config/draft/forms'] = () => reply(200, fxFormsEmpty)
    serve()
    renderAt('/admin/forms')
    expect(await screen.findByTestId('forms-empty')).toHaveTextContent('Forms are optional')
    expect(screen.getByTestId('forms-empty-build')).toBeInTheDocument()
  })

  it('adds, moves and removes fields, and shows inline never-collect problems', async () => {
    renderAt('/admin/forms/fixture_form')
    expect(await screen.findByTestId('form-field-0-key')).toHaveValue('preferred_day')
    await userEvent.click(screen.getByTestId('form-field-0-down'))
    expect(screen.getByTestId('form-field-0-key')).toHaveValue('wants_brochure')
    await userEvent.click(screen.getByTestId('form-add-field'))
    await userEvent.type(screen.getByTestId('form-field-2-key'), 'member_no')
    expect(screen.getByTestId('form-field-2-key')).toHaveValue('member_no')
    PUT.mockResolvedValue(
      reply(200, {
        name: 'forms.fixture_form',
        value: fxForm.value,
        draft_problems: [{ document: 'forms.fixture_form', path: 'fields.member_no', message: 'names something the clinic never collects' }],
      }),
    )
    await userEvent.click(screen.getByTestId('form-save'))
    expect(await screen.findByTestId('form-problems')).toHaveTextContent('never collects')
    const body = PUT.mock.calls[0][1].body.value
    expect(Object.keys(body.fields)).toEqual(['wants_brochure', 'preferred_day', 'member_no'])
    expect(body.fields.member_no.type).toBe('text')
  })

  it('xxadminformsfixxx: new agent and form need their required fields; names follow the title', async () => {
    renderAt('/admin/agents/new')
    const title = await screen.findByTestId('agent-title')
    await waitFor(() => expect(title).toBeEnabled())
    expect(title).toHaveAttribute('aria-required', 'true')
    expect(screen.getByTestId('agent-persona')).toHaveAttribute('aria-required', 'true')
    expect(screen.getByTestId('agent-bridge').closest('.ui-field')).toHaveTextContent('(optional)')
    await userEvent.type(title, 'Front Desk')
    expect(screen.getByTestId('agent-name')).toHaveValue('front_desk')
    expect(screen.getByTestId('agent-save')).toBeDisabled()
    expect(screen.getByTestId('agent-missing')).toHaveTextContent('Fill in before saving: Persona')
    await userEvent.type(screen.getByTestId('agent-persona'), 'Kind and brief.')
    expect(screen.getByTestId('agent-save')).toBeEnabled()
    expect(screen.queryByTestId('agent-missing')).toBeNull()
    cleanup()
    renderAt('/admin/forms/new')
    const formTitle = await screen.findByTestId('form-title')
    await waitFor(() => expect(formTitle).toBeEnabled())
    await userEvent.type(formTitle, 'Callback Request')
    expect(screen.getByTestId('form-name')).toHaveValue('callback_request')
    expect(screen.getByTestId('form-save')).toBeDisabled()
    expect(screen.getByTestId('form-missing')).toHaveTextContent('at least one field')
    await userEvent.click(screen.getByTestId('form-add-field'))
    await userEvent.type(screen.getByTestId('form-field-0-label'), 'Best day')
    expect(screen.getByTestId('form-field-0-key')).toHaveValue('best_day')
    expect(screen.getByTestId('form-save')).toBeEnabled()
  }, 20_000)

  it('xxadminformsfixxx: a refused agent save names the field in plain words', async () => {
    renderAt('/admin/agents/fixture_desk')
    const persona = await screen.findByTestId('agent-persona')
    await userEvent.type(persona, ' More.')
    PUT.mockResolvedValue(
      reply(422, { detail: { code: 'invalid', problems: [{ document: 'agents.fixture_desk', path: 'knowledge.0.topic', message: 'string_too_short' }] } }),
    )
    await userEvent.click(screen.getByTestId('agent-save'))
    const list = await screen.findByTestId('agent-problems')
    expect(list).toHaveTextContent('Fact 1: Topic cannot be empty')
    expect(list).not.toHaveTextContent('knowledge.0.topic')
  })

  it('type options follow the field type', async () => {
    renderAt('/admin/forms/fixture_form')
    expect(await screen.findByTestId('form-field-0-values')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByTestId('form-field-0-type'), 'number')
    expect(screen.queryByTestId('form-field-0-values')).toBeNull()
    expect(screen.getByTestId('form-field-0-max')).toBeInTheDocument()
  })
})
