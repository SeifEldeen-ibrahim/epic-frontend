import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AdminRoutes } from '../../admin/AdminRoutes'
import { SET_BY_US } from '../../admin/LangFields'
import { fxAdmin, fxAgents, fxConfigState, fxLanguageCatalog, fxLanguages } from '../../admin/fixtures/data'
import { api } from '../../api/client'
import { createQueryClient } from '../../api/queryClient'

vi.mock('../../api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() } }))

const GET = vi.mocked(api.GET) as unknown as Mock
const PUT = vi.mocked(api.PUT) as unknown as Mock

function reply(status: number, body: object) {
  const ok = status < 400
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status } }
}

const replies: Record<string, () => unknown> = {
  '/api/admin/auth/me': () => reply(200, fxAdmin),
  '/api/admin/config': () => reply(200, fxConfigState),
  '/api/admin/config/languages/catalog': () => reply(200, fxLanguageCatalog),
  '/api/admin/config/draft/languages': () => reply(200, fxLanguages),
  '/api/admin/config/draft/agents': () => reply(200, fxAgents),
}

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

function renderAt(path: string) {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/*" element={<AdminRoutes />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const savedEcho = async (_path: string, opts: { body: { value: unknown } }) =>
  reply(200, { name: 'languages', value: opts.body.value, draft_problems: [] })

beforeEach(() => {
  GET.mockReset()
  PUT.mockReset()
  GET.mockImplementation(async (path: string) => {
    const r = replies[path]
    return r ? r() : new Promise(() => {})
  })
})
afterEach(cleanup)

describe('T-LANG-PAGES: language list', () => {
  it('shows every language, and English is aria-disabled with the text "Always on"', async () => {
    renderAt('/admin/languages')
    const list = await screen.findByTestId('languages-list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(fxLanguageCatalog.languages.length)
    for (const l of fxLanguageCatalog.languages) {
      expect(screen.getByRole('switch', { name: `Use ${l.name} on calls` })).toBeInTheDocument()
    }
    const english = screen.getByRole('switch', { name: 'Use English on calls' })
    expect(english).toHaveAttribute('aria-disabled', 'true')
    expect(english).toBeChecked()
    expect(within(screen.getByTestId('lang-row-en')).getByText('Always on')).toBeInTheDocument()
    expect(screen.getByText('العربية')).toHaveAttribute('dir', 'rtl')
    expect(screen.getByTestId('lang-status-ar')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByTestId('lang-status-ar')).toHaveTextContent('Off')
    expect(screen.getByTestId('lang-status-en')).toHaveTextContent('Ready')
    // Spanish without the custody-style line is counted, never blocked (CC3).
    expect(screen.getByTestId('lang-status-es')).toHaveTextContent('1 left to fill')
    expect(screen.getByTestId('lang-fill-ar')).toHaveAttribute('href', '/admin/languages/ar')
    await userEvent.click(english)
    expect(PUT).not.toHaveBeenCalled()
  })

  it('switching Arabic on only saves, shows a busy state, then "N left to fill"', async () => {
    let finish: (v: unknown) => void = () => {}
    PUT.mockImplementation((path: string, opts: { body: { value: unknown } }) => new Promise((r) => (finish = () => r(savedEcho(path, opts)))))
    renderAt('/admin/languages')
    await userEvent.click(await screen.findByRole('switch', { name: 'Use Arabic on calls' }))
    expect(screen.getByTestId('lang-saving-ar')).toHaveTextContent('Saving…')
    expect(PUT).toHaveBeenCalledWith('/api/admin/config/draft/languages', expect.anything())
    const body = PUT.mock.calls[0][1].body.value as { items: Record<string, { enabled: boolean }> }
    expect(body.items.ar.enabled).toBe(true)
    expect(body.items.es.enabled).toBe(true)
    finish(undefined)
    // 4 lines + 1 handoff line + crisis phrases
    await waitFor(() => expect(screen.getByTestId('lang-status-ar')).toHaveTextContent('6 left to fill'))
    expect(screen.queryByTestId('lang-saving-ar')).toBeNull()
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/admin\/languages$/)
  })

  it('a failed save reverts the switch and shows the error', async () => {
    PUT.mockResolvedValue(reply(500, { detail: 'boom' }))
    renderAt('/admin/languages')
    const ar = await screen.findByRole('switch', { name: 'Use Arabic on calls' })
    await userEvent.click(ar)
    expect(await screen.findByTestId('lang-error-ar')).toHaveTextContent('Could not save')
    expect(ar).not.toBeChecked()
    expect(screen.getByTestId('lang-status-ar')).toHaveTextContent('Off')
  })

  it('holds the space while loading and offers a retry on a fetch error', async () => {
    replies['/api/admin/config/languages/catalog'] = () => new Promise(() => {})
    renderAt('/admin/languages')
    expect(await screen.findByTestId('languages-loading')).toHaveAttribute('aria-busy', 'true')
    cleanup()
    replies['/api/admin/config/languages/catalog'] = () => reply(500, { detail: 'x' })
    renderAt('/admin/languages')
    expect(await screen.findByTestId('languages-error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    replies['/api/admin/config/languages/catalog'] = () => reply(200, fxLanguageCatalog)
  })
})

describe('T-LANG-PAGES: language page', () => {
  it('shows the groups and one handoff field per agent that hands off', async () => {
    renderAt('/admin/languages/ar')
    expect(await screen.findByTestId('language-ar')).toBeInTheDocument()
    for (const h of ['What callers hear', 'When an agent passes the caller on', 'Crisis', "What the caller's screen shows"]) {
      expect(screen.getByRole('heading', { name: h })).toBeInTheDocument()
    }
    await waitFor(() => expect(screen.getByLabelText('Fixture Desk')).toHaveAttribute('id', 'lang-ar-handoff-fixture_desk'))
    expect(screen.queryByLabelText('Receptionist')).toBeNull()
    expect(screen.getByTestId('lang-ar-after_hours_note')).toHaveAttribute('dir', 'rtl')
    expect(screen.getByText('In English: We are closed. We open {next_opening}.')).toBeInTheDocument()
    expect(screen.getByTestId('language-off')).toHaveTextContent('Turn this language on to use it on calls')
  })

  it('shows the en/es lines we set as locked, plus the crisis floor', async () => {
    renderAt('/admin/languages/es')
    const locked = await screen.findByTestId('lang-es-goodbye-locked')
    expect(locked).toHaveTextContent('Gracias por llamar. Adiós.')
    expect(locked).toHaveTextContent(SET_BY_US)
    expect(screen.queryByTestId('lang-es-goodbye')).toBeNull()
    expect(screen.getAllByTestId('lang-es-crisis-list-locked').map((x) => x.textContent)).toEqual([expect.stringContaining('crisis ficticia')])
  })

  it('one save covers the whole page', async () => {
    PUT.mockImplementation(savedEcho)
    renderAt('/admin/languages/ar')
    await userEvent.type(await screen.findByTestId('lang-ar-goodbye'), 'وداعا')
    await userEvent.type(await screen.findByLabelText('Fixture Desk'), 'لحظة')
    await userEvent.click(screen.getByTestId('language-save'))
    expect(PUT).toHaveBeenCalledTimes(1)
    const item = PUT.mock.calls[0][1].body.value.items.ar
    expect(item.lines.goodbye).toBe('وداعا')
    expect(item.handoff.fixture_desk).toBe('لحظة')
    expect(await screen.findByTestId('language-result')).toHaveTextContent('Saved')
  })

  it('a hash link focuses the field', async () => {
    renderAt('/admin/languages/ar#lang-ar-after_hours_note')
    await waitFor(() => expect(screen.getByTestId('lang-ar-after_hours_note')).toHaveFocus())
  })

  it('an unknown language shows "Language not found"', async () => {
    renderAt('/admin/languages/zz')
    expect(await screen.findByTestId('language-not-found')).toHaveTextContent('Language not found')
  })

  it('a finished language says it is ready to make live', async () => {
    renderAt('/admin/languages/en')
    expect(await screen.findByTestId('language-ready')).toHaveTextContent('Ready. Make changes live to use it on calls.')
    expect(await screen.findByTestId('lang-en-handoff-fixture_desk')).toHaveAttribute('href', '/admin/agents/fixture_desk')
  })
})
