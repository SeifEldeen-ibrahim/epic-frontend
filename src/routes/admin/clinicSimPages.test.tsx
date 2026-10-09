import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AdminRoutes } from '../../admin/AdminRoutes'
import {
  fxAdmin,
  fxClinicAppointments,
  fxClinicDepartments,
  fxClinicInfo,
  fxClinicPatients,
  fxClinicPatientsEmpty,
  fxClinicProviders,
  fxClinicSlots,
  fxReviewer,
} from '../../admin/fixtures/data'
import { api } from '../../api/client'
import { createQueryClient } from '../../api/queryClient'

vi.mock('../../api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), PATCH: vi.fn() } }))

const GET = vi.mocked(api.GET) as unknown as Mock
const POST = vi.mocked(api.POST) as unknown as Mock
const PATCH = vi.mocked(api.PATCH) as unknown as Mock

function reply(status: number, body: unknown) {
  const ok = status < 400
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status } }
}
const never = () => new Promise(() => {})

type Handler = (opts: { body?: Record<string, unknown>; params?: Record<string, unknown> }) => unknown
let me = fxAdmin
let gets: Record<string, Handler>
let posts: Record<string, Handler>

const SEARCH = '/api/admin/clinic-sim/patients/search'
const AVAIL = '/api/admin/clinic-sim/availability'
const APPTS = '/api/admin/clinic-sim/appointments'
const ANA = fxClinicPatients.items[0]
const BEN = fxClinicPatients.items[1]
const APPT = fxClinicAppointments.items[0]

/** Searches the fixture patients the way the sim does (name, phone or record number). */
const searchPatients: Handler = ({ body }) => {
  const q = String(body?.q ?? '').toLowerCase()
  const items = fxClinicPatients.items.filter((p) => !q || `${p.first_name} ${p.last_name} ${p.phone} ${p.mrn}`.toLowerCase().includes(q))
  return reply(200, { items, total: items.length })
}

function Where() {
  const l = useLocation()
  return <span data-testid="where">{`${l.pathname}${l.search}`}</span>
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

const calls = (m: Mock, path: string) => m.mock.calls.filter(([p]) => p === path)

beforeEach(() => {
  me = fxAdmin
  gets = {
    '/api/admin/clinic-sim/info': () => reply(200, fxClinicInfo),
    '/api/admin/clinic-sim/departments': () => reply(200, fxClinicDepartments),
    '/api/admin/clinic-sim/providers': () => reply(200, fxClinicProviders),
    [AVAIL]: () => reply(200, fxClinicSlots),
    [APPTS]: () => reply(200, fxClinicAppointments),
  }
  posts = { [SEARCH]: searchPatients }
  GET.mockReset()
  POST.mockReset()
  PATCH.mockReset()
  GET.mockImplementation(async (path: string, opts) => {
    if (path === '/api/admin/auth/me') return reply(200, me)
    const h = gets[path]
    return h ? h(opts ?? {}) : never()
  })
  POST.mockImplementation(async (path: string, opts) => {
    const h = posts[path]
    return h ? h(opts ?? {}) : never()
  })
})
afterEach(cleanup)

describe('T-CLINIC-PAGES: access', () => {
  it('a reviewer gets the forbidden view on the clinic sim', async () => {
    me = fxReviewer
    renderAt('/admin/clinic-sim')
    expect(await screen.findByTestId('forbidden')).toHaveTextContent("You don't have access to this page")
    expect(screen.queryByTestId('admin-clinic-sim')).toBeNull()
  })

  it('an admin opens it; the tab is kept in the URL and survives a reload', async () => {
    renderAt('/admin/clinic-sim?tab=appointments')
    expect(await screen.findByTestId('clinic-panel-appointments')).toBeInTheDocument()
    expect(screen.getByTestId('clinic-tab-appointments')).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByTestId('clinic-tab-departments'))
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/clinic-sim?tab=departments')
    const url = screen.getByTestId('where').textContent ?? ''
    cleanup()
    renderAt(url)
    expect(await screen.findByTestId('clinic-panel-departments')).toBeInTheDocument()
    expect(screen.getByTestId('clinic-tab-departments')).toHaveAttribute('aria-selected', 'true')
  })
})

describe('T-CLINIC-PAGES: patients tab', () => {
  it('renders the loading state', async () => {
    posts[SEARCH] = never
    renderAt('/admin/clinic-sim')
    expect(await screen.findByTestId('clinic-patients-loading')).toHaveAttribute('aria-busy', 'true')
  })

  it('renders the empty state', async () => {
    posts[SEARCH] = () => reply(200, fxClinicPatientsEmpty)
    renderAt('/admin/clinic-sim?tab=patients')
    expect(await screen.findByTestId('clinic-patients-empty')).toHaveTextContent('No patients yet')
  })

  it('renders the error state with a retry', async () => {
    posts[SEARCH] = () => reply(500, { detail: 'boom' })
    renderAt('/admin/clinic-sim')
    const error = await screen.findByTestId('clinic-patients-error', {}, { timeout: 4000 })
    expect(within(error).getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('renders the unreachable state on a 503', async () => {
    posts[SEARCH] = () => reply(503, { detail: 'clinic_sim_unavailable' })
    renderAt('/admin/clinic-sim')
    expect(await screen.findByTestId('clinic-unreachable')).toHaveTextContent("The clinic sim isn't reachable right now")
  })

  it('search filters the list, and an unmatched search shows the filtered-empty state', async () => {
    renderAt('/admin/clinic-sim')
    const table = await screen.findByTestId('admin-table-clinic-patients')
    expect(within(table).getAllByRole('row')).toHaveLength(fxClinicPatients.items.length + 1)
    await userEvent.type(screen.getByTestId('clinic-patient-q'), 'Ben')
    await userEvent.click(screen.getByTestId('clinic-patient-search-submit'))
    await waitFor(() => expect(within(screen.getByTestId('admin-table-clinic-patients')).getAllByRole('row')).toHaveLength(2))
    expect(screen.getByText('Ben Example')).toBeInTheDocument()
    expect(screen.queryByText('Ana Fixture')).toBeNull()
    expect(calls(POST, SEARCH).at(-1)?.[1].body).toEqual({ q: 'Ben', limit: 20, offset: 0 })
    await userEvent.clear(screen.getByTestId('clinic-patient-q'))
    await userEvent.type(screen.getByTestId('clinic-patient-q'), 'nobody')
    await userEvent.click(screen.getByTestId('clinic-patient-search-submit'))
    expect(await screen.findByTestId('clinic-patients-filtered-empty')).toHaveTextContent('No patients match')
  })

  it('add patient: a 422 shows the problem under its field and keeps the dialog open', async () => {
    posts['/api/admin/clinic-sim/patients'] = () =>
      reply(422, { detail: { problems: [{ document: 'patient', path: 'body.date_of_birth', message: 'date_parsing' }] } })
    renderAt('/admin/clinic-sim')
    await screen.findByTestId('admin-table-clinic-patients')
    await userEvent.click(screen.getByTestId('clinic-patient-add'))
    const dialog = screen.getByTestId('clinic-patient-dialog')
    expect(within(dialog).getByTestId('clinic-patient-dialog-confirm')).toBeDisabled()
    await userEvent.type(screen.getByTestId('clinic-patient-first_name'), 'Dana')
    await userEvent.type(screen.getByTestId('clinic-patient-last_name'), 'Fixture')
    await userEvent.type(screen.getByTestId('clinic-patient-date_of_birth'), '1990-13-45')
    await userEvent.type(screen.getByTestId('clinic-patient-phone'), '555-0199')
    await userEvent.click(within(dialog).getByTestId('clinic-patient-dialog-confirm'))
    expect(await within(dialog).findByText('Date of birth must be a date')).toBeInTheDocument()
    expect(screen.getByTestId('clinic-patient-date_of_birth')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('clinic-patient-error')).toHaveTextContent('Some fields need fixing')
    expect(calls(POST, '/api/admin/clinic-sim/patients')[0][1].body).toEqual({
      first_name: 'Dana',
      last_name: 'Fixture',
      date_of_birth: '1990-13-45',
      phone: '555-0199',
      email: null,
    })
    expect(screen.getByTestId('clinic-patient-dialog')).toBeInTheDocument()
  })

  it('delete asks first; confirming makes the call and refreshes the list', async () => {
    posts['/api/admin/clinic-sim/patients/{patient_id}/delete'] = () => reply(200, { ...BEN })
    renderAt('/admin/clinic-sim')
    await screen.findByTestId('admin-table-clinic-patients')
    await userEvent.click(screen.getByTestId(`clinic-patient-delete-${BEN.id}`))
    const dialog = screen.getByTestId('clinic-delete-dialog')
    expect(dialog).toHaveTextContent('Delete Ben Example? Their upcoming appointments will be cancelled.')
    expect(calls(POST, '/api/admin/clinic-sim/patients/{patient_id}/delete')).toHaveLength(0)
    const searchesBefore = calls(POST, SEARCH).length
    await userEvent.click(within(dialog).getByTestId('clinic-delete-dialog-confirm'))
    await waitFor(() => expect(calls(POST, '/api/admin/clinic-sim/patients/{patient_id}/delete')).toHaveLength(1))
    expect(calls(POST, '/api/admin/clinic-sim/patients/{patient_id}/delete')[0][1].params).toEqual({ path: { patient_id: BEN.id } })
    await waitFor(() => expect(calls(POST, SEARCH).length).toBeGreaterThan(searchesBefore))
    await waitFor(() => expect(screen.queryByTestId('clinic-delete-dialog')).toBeNull())
  })
})

async function openBook() {
  renderAt('/admin/clinic-sim?tab=appointments')
  await screen.findByTestId('admin-table-clinic-appointments')
  await userEvent.click(screen.getByTestId('clinic-book'))
  const dialog = screen.getByTestId('clinic-book-dialog')
  await waitFor(() => expect(within(dialog).getByRole('option', { name: /Ana Fixture/, hidden: true })).toBeInTheDocument())
  await userEvent.selectOptions(within(dialog).getByTestId('clinic-book-patient'), ANA.id)
  await waitFor(() => expect(within(dialog).getByRole('option', { name: fxClinicDepartments[0].name, hidden: true })).toBeInTheDocument())
  await userEvent.selectOptions(within(dialog).getByTestId('clinic-book-department'), '1')
  fireEvent.change(within(dialog).getByTestId('clinic-book-date'), { target: { value: '2026-11-02' } })
  await waitFor(() => expect(within(dialog).getAllByTestId('clinic-slot').length).toBe(fxClinicSlots.length))
  return dialog
}

describe('T-CLINIC-PAGES: appointments tab', () => {
  it('shows the fixed slot 2026-11-02T14:00:00Z as 9:00 AM EST (clinic time)', async () => {
    renderAt('/admin/clinic-sim?tab=appointments')
    const table = await screen.findByTestId('admin-table-clinic-appointments')
    await waitFor(() => expect(table).toHaveTextContent(/Nov 2, 2026, 9:00\sAM\sEST/))
    expect(table).toHaveTextContent('Ana Fixture')
    expect(table).toHaveTextContent(fxClinicDepartments[0].name)
    expect(table).toHaveTextContent('Dr. Fixture Okafor')
  })

  it('book: department, date and slot give the right POST body', async () => {
    posts[APPTS] = ({ body }) => reply(201, { ...APPT, ...body })
    const dialog = await openBook()
    expect(calls(GET, AVAIL).at(-1)?.[1].params.query).toEqual({ department_id: 1, date_from: '2026-11-02', date_to: '2026-11-02' })
    const slot = within(dialog).getAllByTestId('clinic-slot')[0]
    expect(slot).toHaveTextContent(/^9:00\sAM\sEST with Dr\. Fixture Okafor$/)
    await userEvent.click(slot)
    expect(slot).toHaveAttribute('aria-pressed', 'true')
    await userEvent.selectOptions(within(dialog).getByTestId('clinic-book-visit-type'), 'follow_up')
    await userEvent.type(within(dialog).getByTestId('clinic-book-note'), 'Fixture note')
    await userEvent.click(within(dialog).getByTestId('clinic-book-dialog-confirm'))
    await waitFor(() => expect(calls(POST, APPTS)).toHaveLength(1))
    expect(calls(POST, APPTS)[0][1].body).toEqual({
      patient_id: ANA.id,
      department_id: 1,
      provider_id: 11,
      starts_at: '2026-11-02T14:00:00Z',
      visit_type: 'follow_up',
      note: 'Fixture note',
    })
    await waitFor(() => expect(screen.queryByTestId('clinic-book-dialog')).toBeNull())
  })

  it('a 409 on book keeps the dialog open with "That time was just taken" and refetches the slots', async () => {
    posts[APPTS] = () => reply(409, { detail: 'slot_taken' })
    const dialog = await openBook()
    await userEvent.click(within(dialog).getAllByTestId('clinic-slot')[0])
    const before = calls(GET, AVAIL).length
    await userEvent.click(within(dialog).getByTestId('clinic-book-dialog-confirm'))
    expect(await within(dialog).findByTestId('clinic-book-message')).toHaveTextContent('That time was just taken')
    expect(screen.getByTestId('clinic-book-dialog')).toBeInTheDocument()
    await waitFor(() => expect(calls(GET, AVAIL).length).toBeGreaterThan(before))
    await waitFor(() => expect(within(dialog).getAllByTestId('clinic-slot').length).toBe(fxClinicSlots.length))
    for (const s of within(dialog).getAllByTestId('clinic-slot')) expect(s).toHaveAttribute('aria-pressed', 'false')
    expect(within(dialog).getByTestId('clinic-book-dialog-confirm')).toBeDisabled()
  })

  it('cancel needs confirmation; a 404 shows "This record no longer exists" and refreshes the list', async () => {
    posts['/api/admin/clinic-sim/appointments/{appointment_id}/cancel'] = () => reply(404, { detail: 'not_found' })
    renderAt('/admin/clinic-sim?tab=appointments')
    await screen.findByTestId('admin-table-clinic-appointments')
    await userEvent.click(screen.getByTestId(`clinic-appt-cancel-${APPT.id}`))
    const dialog = screen.getByTestId('clinic-cancel-dialog')
    expect(dialog).toHaveTextContent("Cancel Ana Fixture's appointment on")
    expect(calls(POST, '/api/admin/clinic-sim/appointments/{appointment_id}/cancel')).toHaveLength(0)
    const before = calls(GET, APPTS).length
    await userEvent.click(within(dialog).getByTestId('clinic-cancel-dialog-confirm'))
    expect(await screen.findByTestId('clinic-gone')).toHaveTextContent('This record no longer exists')
    expect(calls(POST, '/api/admin/clinic-sim/appointments/{appointment_id}/cancel')[0][1].params).toEqual({
      path: { appointment_id: APPT.id },
    })
    await waitFor(() => expect(calls(GET, APPTS).length).toBeGreaterThan(before))
    expect(screen.queryByTestId('clinic-cancel-dialog')).toBeNull()
  })

  it('reschedule is confirmed by the dialog submit and sends the new time', async () => {
    PATCH.mockImplementation(async (_path: string, opts: { body: Record<string, unknown> }) => reply(200, { ...APPT, ...opts.body }))
    renderAt('/admin/clinic-sim?tab=appointments')
    await screen.findByTestId('admin-table-clinic-appointments')
    await userEvent.click(screen.getByTestId(`clinic-appt-reschedule-${APPT.id}`))
    const dialog = screen.getByTestId('clinic-book-dialog')
    expect(dialog).toHaveTextContent('Ana Fixture')
    fireEvent.change(within(dialog).getByTestId('clinic-book-date'), { target: { value: '2026-11-02' } })
    await waitFor(() => expect(within(dialog).getAllByTestId('clinic-slot').length).toBe(fxClinicSlots.length))
    await userEvent.click(within(dialog).getAllByTestId('clinic-slot')[3])
    expect(PATCH).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByTestId('clinic-book-dialog-confirm'))
    await waitFor(() => expect(PATCH).toHaveBeenCalledTimes(1))
    expect(PATCH.mock.calls[0][0]).toBe('/api/admin/clinic-sim/appointments/{appointment_id}')
    expect(PATCH.mock.calls[0][1]).toEqual({
      params: { path: { appointment_id: APPT.id } },
      body: { starts_at: fxClinicSlots[3].starts_at, provider_id: fxClinicSlots[3].provider_id },
    })
    await waitFor(() => expect(screen.queryByTestId('clinic-book-dialog')).toBeNull())
  })
})

describe('T-CLINIC-PAGES: departments tab', () => {
  it('lists each department with its providers', async () => {
    renderAt('/admin/clinic-sim?tab=departments')
    const table = await screen.findByTestId('admin-table-clinic-departments')
    for (const d of fxClinicDepartments) {
      const row = within(table).getByText(d.name).closest('tr') as HTMLElement
      for (const p of fxClinicProviders.filter((x) => x.department_id === d.id)) {
        expect(within(row).getByText(p.display_name)).toBeInTheDocument()
      }
    }
  })
})
