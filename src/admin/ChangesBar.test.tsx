import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { api } from '../api/client'
import { createQueryClient } from '../api/queryClient'
import { AdminRoutes } from './AdminRoutes'
import {
  fxAdmin,
  fxAgentDesk,
  fxAgents,
  fxCatalog,
  fxConfigClean,
  fxConfigProblems,
  fxConfigReviewer,
  fxConfigState,
  fxForms,
  fxReviewer,
  fxRouting,
} from './fixtures/data'

vi.mock('../api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() } }))

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
    '/api/admin/config/draft/knowledge/{section}': () => reply(200, fxRouting),
    '/api/admin/config/draft/agents': () => reply(200, fxAgents),
    '/api/admin/config/draft/agents/{name}': () => reply(200, fxAgentDesk),
    '/api/admin/config/draft/forms': () => reply(200, fxForms),
  }
  serve()
})
afterEach(cleanup)

describe('T-FE: changes bar', () => {
  it('shows on Setup pages only when there are changes that are not live', async () => {
    renderAt('/admin/departments')
    const bar = await screen.findByTestId('changes-bar')
    expect(bar).toHaveTextContent("You have changes that aren't live yet.")
    expect(bar).toHaveTextContent('Changed: Departments, Agents')
    expect(within(bar).getByTestId('changes-make-live')).toBeEnabled()
    expect(bar.textContent).not.toMatch(/cfg-|draft|publish/i)
    cleanup()
    serve()
    renderAt('/admin/calls')
    expect(await screen.findByTestId('admin-calls')).toBeInTheDocument()
    expect(screen.queryByTestId('changes-bar')).toBeNull()
  })

  it('is hidden with nothing to make live, and for reviewers', async () => {
    replies['/api/admin/config'] = () => reply(200, fxConfigClean)
    renderAt('/admin/agents')
    expect(await screen.findByTestId('admin-table-agents')).toBeInTheDocument()
    expect(screen.queryByTestId('changes-bar')).toBeNull()
    cleanup()
    replies['/api/admin/config'] = () => reply(200, fxConfigReviewer)
    serve(fxReviewer)
    renderAt('/admin/agents')
    expect(await screen.findByTestId('admin-table-agents')).toBeInTheDocument()
    expect(screen.queryByTestId('changes-bar')).toBeNull()
  })

  it('lists what to fix, with links, and blocks making changes live', async () => {
    replies['/api/admin/config'] = () => reply(200, fxConfigProblems)
    renderAt('/admin/forms')
    const fix = await screen.findByTestId('changes-fix')
    expect(fix).toHaveTextContent('Fix these 2 before making changes live:')
    expect(within(fix).getByRole('link', { name: 'Forms › fixture_form' })).toHaveAttribute('href', '/admin/forms/fixture_form')
    expect(fix).toHaveTextContent('names something the clinic never collects')
    expect(within(fix).getByRole('link', { name: 'Agents › fixture_desk' })).toHaveAttribute('href', '/admin/agents/fixture_desk')
    expect(screen.getByTestId('changes-make-live')).toBeDisabled()
  })

  it('makes changes live after confirming, and explains a conflict', async () => {
    POST.mockResolvedValueOnce(reply(409, { detail: 'stale_draft' }))
    renderAt('/admin/agents')
    await userEvent.click(await screen.findByTestId('changes-make-live'))
    expect(screen.getByTestId('changes-confirm')).toHaveTextContent('New calls use your changes right away')
    await userEvent.click(screen.getByTestId('changes-confirm-confirm'))
    expect(await screen.findByTestId('changes-result')).toHaveTextContent('Someone else made changes live')
    POST.mockResolvedValueOnce(reply(200, { seq: 4, label: 'cfg-4-x', live_label: 'cfg-4-x' }))
    await userEvent.click(screen.getByTestId('changes-make-live'))
    await userEvent.click(screen.getByTestId('changes-confirm-confirm'))
    await waitFor(() => expect(screen.getByTestId('changes-result')).toHaveTextContent('Your changes are live for new calls.'))
    expect(POST).toHaveBeenLastCalledWith('/api/admin/config/publish', { body: { based_on_seq: 3, note: null } })
  })

  it('discards after confirming', async () => {
    POST.mockResolvedValueOnce(reply(200, fxConfigClean))
    renderAt('/admin/knowledge')
    await userEvent.click(await screen.findByTestId('changes-discard'))
    await userEvent.click(screen.getByTestId('changes-confirm-confirm'))
    await waitFor(() => expect(POST).toHaveBeenCalledWith('/api/admin/config/draft/discard', expect.anything()))
  })

  it('waits for unsaved edits to be saved or cancelled', async () => {
    renderAt('/admin/agents/fixture_desk')
    const persona = await screen.findByTestId('agent-persona')
    expect(screen.getByTestId('changes-make-live')).toBeEnabled()
    await userEvent.type(persona, ' More.')
    expect(screen.getByTestId('changes-make-live')).toBeDisabled()
    expect(screen.getByTestId('changes-discard')).toBeDisabled()
    expect(screen.getByTestId('changes-unsaved')).toHaveTextContent('Save or cancel your edits first.')
  })
})
