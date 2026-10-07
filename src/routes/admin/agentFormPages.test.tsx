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

  it('opens switchboard in the same editor with every tool editable', async () => {
    renderAt('/admin/agents/switchboard')
    expect(await screen.findByTestId('agent-tool-route_to')).not.toBeDisabled()
    expect(screen.getByTestId('agent-tool-route_to')).toBeChecked()
  })

  it('shows the generated instructions read-only on demand', async () => {
    renderAt('/admin/agents/fixture_desk')
    const details = await screen.findByTestId('agent-compiled')
    await userEvent.click(within(details).getByText('Generated instructions (read-only)'))
    expect(await screen.findByTestId('agent-compiled-prompt')).toHaveTextContent("You are the clinic's Fixture Desk")
  })

  it('a reviewer sees the agent without save controls', async () => {
    replies['/api/admin/config'] = () => reply(200, fxConfigReviewer)
    serve(fxReviewer)
    renderAt('/admin/agents/fixture_desk')
    expect(await screen.findByTestId('agent-persona')).toBeDisabled()
    expect(screen.queryByTestId('agent-save')).toBeNull()
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
    expect(await screen.findByTestId('forms-empty')).toBeInTheDocument()
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

  it('type options follow the field type', async () => {
    renderAt('/admin/forms/fixture_form')
    expect(await screen.findByTestId('form-field-0-values')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByTestId('form-field-0-type'), 'number')
    expect(screen.queryByTestId('form-field-0-values')).toBeNull()
    expect(screen.getByTestId('form-field-0-max')).toBeInTheDocument()
  })
})
