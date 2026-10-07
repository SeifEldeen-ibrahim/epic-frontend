import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AdminRoutes } from '../../admin/AdminRoutes'
import { fxAdmin, fxConfigClean, fxHomeBlank, fxHomeLive, fxHomePartial, fxReviewer } from '../../admin/fixtures/data'
import { api } from '../../api/client'
import { createQueryClient } from '../../api/queryClient'

vi.mock('../../api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() } }))

const GET = vi.mocked(api.GET) as unknown as Mock
const POST = vi.mocked(api.POST) as unknown as Mock

function reply(status: number, body: object) {
  const ok = status < 400
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status } }
}

let home: () => unknown

function serve(me = fxAdmin) {
  GET.mockImplementation(async (path: string) => {
    if (path === '/api/admin/auth/me') return reply(200, me)
    if (path === '/api/admin/home') return home()
    if (path === '/api/admin/config') return reply(200, fxConfigClean)
    return new Promise(() => {})
  })
}

function renderHome() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/admin']}>
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
  home = () => reply(200, fxHomeBlank)
  serve()
})
afterEach(cleanup)

import { BANNED } from '../../admin/copy.test'

const KEYS = ['basics', 'departments', 'forms', 'specialists', 'front_desk', 'answering', 'live', 'test_call']

describe('T-FE: Home', () => {
  it('on a blank start says the line is not live and lists the 8 steps in setup order', async () => {
    renderHome()
    expect(await screen.findByTestId('home-line')).toHaveTextContent('Your line is not taking calls yet')
    expect(screen.getByTestId('home-calls-today')).toHaveTextContent('0')
    expect(screen.getByTestId('home-forms-waiting')).toHaveTextContent('Forms waiting for approval')
    const steps = within(screen.getByTestId('home-checklist')).getAllByRole('listitem')
    expect(steps.map((li) => li.getAttribute('data-testid'))).toEqual(KEYS.map((k) => `home-step-${k}`))
    expect(within(steps[0]).getByRole('link')).toHaveAttribute('href', '/admin/knowledge')
    expect(within(steps[1]).getByRole('link')).toHaveTextContent('Departments')
    expect(within(steps[1]).getByRole('link')).toHaveAttribute('href', '/admin/departments')
    expect(within(steps[2]).getByText('Optional')).toBeInTheDocument()
    expect(within(steps[7]).getByRole('link')).toHaveAttribute('href', '/call')
    expect(steps.every((li) => li.getAttribute('data-done') === 'false')).toBe(true)
    expect(screen.getByTestId('load-example')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(BANNED)
  })

  it('marks finished steps done', async () => {
    home = () => reply(200, fxHomePartial)
    renderHome()
    expect(await screen.findByTestId('home-step-basics')).toHaveAttribute('data-done', 'true')
    expect(screen.getByTestId('home-step-departments')).toHaveTextContent('Done')
    expect(screen.getByTestId('home-step-answering')).toHaveAttribute('data-done', 'false')
  })

  it('when live and tested, shows the numbers and hides the checklist', async () => {
    home = () => reply(200, fxHomeLive)
    renderHome()
    expect(await screen.findByTestId('home-line')).toHaveTextContent('Your line is live. New calls are answered by Front desk.')
    expect(screen.getByTestId('home-calls-today')).toHaveTextContent('7')
    expect(within(screen.getByTestId('home-forms-waiting')).getByRole('link')).toHaveAttribute('href', '/admin/queue')
    expect(screen.queryByTestId('home-checklist')).toBeNull()
  })

  it('Load example setup asks first', async () => {
    POST.mockResolvedValue(reply(200, fxConfigClean))
    renderHome()
    await userEvent.click(await screen.findByTestId('load-example'))
    expect(screen.getByTestId('load-example-confirm')).toHaveTextContent('It replaces your changes that are not live yet')
    await userEvent.click(screen.getByTestId('load-example-confirm-confirm'))
    expect(POST).toHaveBeenCalledWith('/api/admin/config/draft/load-defaults', expect.anything())
    expect(await screen.findByTestId('load-example-result')).toHaveTextContent('Example loaded')
  })

  it('a reviewer sees the checklist without the example button', async () => {
    home = () => reply(200, { ...fxHomeBlank, can_edit: false })
    serve(fxReviewer)
    renderHome()
    expect(await screen.findByTestId('home-checklist')).toBeInTheDocument()
    expect(screen.queryByTestId('load-example')).toBeNull()
  })

  it('shows loading, then a retryable error', async () => {
    home = () => new Promise(() => {})
    renderHome()
    expect(await screen.findByTestId('home-loading')).toBeInTheDocument()
    cleanup()
    home = () => reply(500, { detail: 'boom' })
    serve()
    renderHome()
    expect(await screen.findByTestId('home-error')).toBeInTheDocument()
  })
})
