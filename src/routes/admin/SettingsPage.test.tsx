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
const URL = '/api/admin/settings/voice-mode'

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

let modeReply: () => unknown

function renderPage() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/admin/settings']}>
        <Routes>
          <Route path="/admin/*" element={<AdminRoutes />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const radio = (mode: string) => within(screen.getByTestId(`settings-mode-${mode}`)).getByRole('radio')

beforeEach(() => {
  modeReply = () => reply(200, { mode: 'gpt-live', stored: false, updated_at: null })
  GET.mockReset()
  POST.mockReset()
  GET.mockImplementation(async (path: string) => {
    if (path === '/api/admin/auth/me') return reply(200, admin)
    if (path === URL) return modeReply()
    return new Promise(() => {})
  })
})
afterEach(() => cleanup())

describe('T-FE: voice-mode settings', () => {
  it('shows a busy skeleton while loading', async () => {
    modeReply = () => new Promise(() => {})
    renderPage()
    expect(await screen.findByTestId('settings-loading')).toHaveAttribute('aria-busy', 'true')
  })

  it('shows a retryable error when loading fails', async () => {
    modeReply = () => reply(503, { detail: 'unavailable' })
    renderPage()
    const error = await screen.findByTestId('settings-error')
    expect(error).toHaveTextContent('Could not load the voice mode.')
    modeReply = () => reply(200, { mode: 'realtime', stored: true, updated_at: '2026-10-07T12:00:00Z' })
    await userEvent.click(within(error).getByRole('button'))
    expect(await screen.findByTestId('settings-mode-realtime')).toBeInTheDocument()
    expect(radio('realtime')).toBeChecked()
  })

  it('shows the default mode, a labelled group and Save disabled until something changes', async () => {
    renderPage()
    expect(await screen.findByRole('group', { name: 'Voice mode for new calls' })).toBeInTheDocument()
    expect(radio('gpt-live')).toBeChecked()
    expect(radio('realtime')).not.toBeChecked()
    expect(screen.getByTestId('settings-meta')).toHaveTextContent('Nothing saved yet')
    expect(screen.getByTestId('settings-mode-realtime')).toHaveTextContent('Calls are not recorded.')
    expect(screen.getByTestId('settings-save')).toBeDisabled()
    await userEvent.click(radio('realtime'))
    expect(screen.getByTestId('settings-save')).toBeEnabled()
    await userEvent.click(radio('gpt-live'))
    expect(screen.getByTestId('settings-save')).toBeDisabled()
  })

  it('saves the new mode and confirms it applies to new calls', async () => {
    POST.mockImplementation(async (path: string, init: { body: { mode: string } }) => {
      expect(path).toBe(URL)
      expect(init.body).toEqual({ mode: 'realtime' })
      return reply(200, { mode: 'realtime', stored: true, updated_at: '2026-10-07T12:00:00Z' })
    })
    renderPage()
    await userEvent.click(await screen.findByRole('radio', { name: /Realtime/ }))
    await userEvent.click(screen.getByTestId('settings-save'))
    expect(await screen.findByTestId('settings-result')).toHaveTextContent('Saved. New calls use this mode.')
    expect(radio('realtime')).toBeChecked()
    expect(screen.getByTestId('settings-mode-realtime')).toHaveTextContent('Current')
    expect(screen.getByTestId('settings-save')).toBeDisabled()
    expect(POST).toHaveBeenCalledTimes(1)
  })

  it('keeps the saved mode selected when saving fails', async () => {
    POST.mockImplementation(async () => reply(503, { detail: 'unavailable' }))
    renderPage()
    await userEvent.click(await screen.findByRole('radio', { name: /Realtime/ }))
    await userEvent.click(screen.getByTestId('settings-save'))
    expect(await screen.findByTestId('settings-result')).toHaveTextContent('Could not save. The previous mode is still in use.')
    await waitFor(() => expect(radio('gpt-live')).toBeChecked())
    expect(radio('realtime')).not.toBeChecked()
  })
})
