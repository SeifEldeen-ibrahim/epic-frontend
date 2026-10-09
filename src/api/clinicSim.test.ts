import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AdminApiError } from './admin'
import {
  CLINIC_SIM_UNREACHABLE,
  ClinicSimUnavailableError,
  clinicSimErrorCode,
  clinicSimKeys,
  isRecordGone,
  isSlotTaken,
  useBookClinicAppointment,
  useClinicDepartments,
  useClinicPatients,
  useCreateClinicPatient,
  useDeleteClinicPatient,
} from './clinicSim'
import { api } from './client'
import { ConfigProblemsError } from './config'
import { createQueryClient } from './queryClient'

vi.mock('./client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), PATCH: vi.fn() } }))

const GET = vi.mocked(api.GET) as unknown as Mock
const POST = vi.mocked(api.POST) as unknown as Mock

function reply(status: number, body: object | undefined) {
  const ok = status < 400
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status } }
}

function setup() {
  const qc = createQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children)
  return { qc, wrapper }
}

const booking = { patient_id: 'p1', department_id: 1, provider_id: 2, starts_at: '2026-10-12T09:00:00Z', visit_type: 'follow_up' as const }

beforeEach(() => {
  GET.mockReset()
  POST.mockReset()
})

describe('T-HOOKS: clinic sim hooks', () => {
  it('keys live under admin/clinic-sim', () => {
    expect(clinicSimKeys.all).toEqual(['admin', 'clinic-sim'])
    expect(clinicSimKeys.info()).toEqual(['admin', 'clinic-sim', 'info'])
    expect(clinicSimKeys.departments()).toEqual(['admin', 'clinic-sim', 'departments'])
    expect(clinicSimKeys.providers(3)).toEqual(['admin', 'clinic-sim', 'providers', { departmentId: 3 }])
    expect(clinicSimKeys.patients({ q: 'ann', limit: 20, offset: 0 })).toEqual([
      'admin',
      'clinic-sim',
      'patients',
      { q: 'ann', limit: 20, offset: 0 },
    ])
    expect(clinicSimKeys.availability({ department_id: 1, date_from: '2026-10-12' })).toEqual([
      'admin',
      'clinic-sim',
      'availability',
      { department_id: 1, date_from: '2026-10-12' },
    ])
    expect(clinicSimKeys.appointments({ status: 'booked' })).toEqual(['admin', 'clinic-sim', 'appointments', { status: 'booked' }])
  })

  it('patient search is a cached POST query', async () => {
    const { qc, wrapper } = setup()
    POST.mockResolvedValueOnce(reply(200, { items: [], total: 0 }))
    const params = { q: 'ann', limit: 20, offset: 0 }
    const { result } = renderHook(() => useClinicPatients(params), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(POST).toHaveBeenCalledWith('/api/admin/clinic-sim/patients/search', { body: params })
    expect(qc.getQueryData(clinicSimKeys.patients(params))).toEqual({ items: [], total: 0 })
  })

  it('a mutation invalidates every clinic-sim query', async () => {
    const { qc, wrapper } = setup()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    POST.mockResolvedValueOnce(reply(200, { id: 'a1' }))
    const { result } = renderHook(() => useBookClinicAppointment(), { wrapper })
    await result.current.mutateAsync(booking)
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['admin', 'clinic-sim'] }))

    spy.mockClear()
    POST.mockResolvedValueOnce(reply(204, undefined))
    const del = renderHook(() => useDeleteClinicPatient(), { wrapper })
    await del.result.current.mutateAsync('p1')
    expect(POST).toHaveBeenLastCalledWith('/api/admin/clinic-sim/patients/{patient_id}/delete', {
      params: { path: { patient_id: 'p1' } },
      body: {},
    })
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['admin', 'clinic-sim'] }))
  })

  it('a 422 becomes ConfigProblemsError', async () => {
    const { wrapper } = setup()
    const problems = [{ document: 'patient', path: 'date_of_birth', message: 'must be YYYY-MM-DD' }]
    POST.mockResolvedValueOnce(reply(422, { detail: { problems } }))
    const { result } = renderHook(() => useCreateClinicPatient(), { wrapper })
    const err = await result.current
      .mutateAsync({ first_name: 'A', last_name: 'B', date_of_birth: 'x', phone: '1' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConfigProblemsError)
    expect((err as ConfigProblemsError).problems).toEqual(problems)
  })

  it('a 503 becomes the plain unreachable error', async () => {
    const { wrapper } = setup()
    GET.mockResolvedValue(reply(503, { detail: 'clinic_sim_unavailable' }))
    const { result } = renderHook(() => useClinicDepartments(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ClinicSimUnavailableError)
    expect((result.current.error as Error).message).toBe(CLINIC_SIM_UNREACHABLE)
    expect(GET).toHaveBeenCalledTimes(1)
  })

  it('404 and 409 keep their code', async () => {
    const { qc, wrapper } = setup()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    POST.mockResolvedValueOnce(reply(409, { detail: 'slot_taken' }))
    const { result } = renderHook(() => useBookClinicAppointment(), { wrapper })
    const err = await result.current.mutateAsync(booking).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AdminApiError)
    expect(clinicSimErrorCode(err)).toBe('slot_taken')
    expect(isSlotTaken(err)).toBe(true)
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['admin', 'clinic-sim'] }))
    expect(isRecordGone(new AdminApiError(404, 'not_found'))).toBe(true)
  })
})
