import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { AdminApiError, handle } from './admin'
import { api } from './client'
import { ConfigProblemsError, type Problem } from './config'
import type { components, paths } from './schema'

type S = components['schemas']
export type ClinicInfo = S['ClinicInfo']
export type ClinicDepartment = S['ClinicDepartment']
export type ClinicProvider = S['ClinicProvider']
export type ClinicFreeSlot = S['ClinicFreeSlot']
export type ClinicPatient = S['ClinicPatient']
export type ClinicPatientList = S['ClinicPatientList']
export type ClinicPatientCreate = S['ClinicPatientCreate']
export type ClinicPatientUpdate = S['ClinicPatientUpdate']
export type ClinicPatientSearch = S['ClinicPatientSearch']
export type ClinicAppointment = S['ClinicAppointment']
export type ClinicAppointmentList = S['ClinicAppointmentList']
export type ClinicAppointmentCreate = S['ClinicAppointmentCreate']
export type ClinicAppointmentReschedule = S['ClinicAppointmentReschedule']
export type ClinicVisitType = ClinicAppointmentCreate['visit_type']
export type ClinicAvailabilityParams = paths['/api/admin/clinic-sim/availability']['get']['parameters']['query']
export type ClinicAppointmentsParams = NonNullable<
  paths['/api/admin/clinic-sim/appointments']['get']['parameters']['query']
>
export interface ClinicPatientsParams {
  q?: string | null
  limit: number
  offset: number
}

export const CLINIC_SIM_UNREACHABLE = "The clinic sim isn't reachable right now"

/** A 503 from the clinic-sim routes (`clinic_sim_unavailable` / `clinic_sim_not_configured`). */
export class ClinicSimUnavailableError extends AdminApiError {
  constructor(detail: string | null) {
    super(503, detail)
    this.name = 'ClinicSimUnavailableError'
    this.message = CLINIC_SIM_UNREACHABLE
  }
}

export function isClinicSimUnavailable(error: unknown): error is ClinicSimUnavailableError {
  return error instanceof ClinicSimUnavailableError
}

/** The server code of a clinic-sim refusal (`not_found`, `slot_taken`, `patient_busy`, ...), else null. */
export function clinicSimErrorCode(error: unknown): string | null {
  return error instanceof AdminApiError && !(error instanceof ConfigProblemsError) ? error.detail : null
}

/** 409 `slot_taken`: "That time was just taken". */
export function isSlotTaken(error: unknown): boolean {
  return error instanceof AdminApiError && error.status === 409 && error.detail === 'slot_taken'
}

/** 404: "This record no longer exists". */
export function isRecordGone(error: unknown): boolean {
  return error instanceof AdminApiError && error.status === 404
}

interface ApiResult<T> {
  data?: T
  error?: unknown
  response: { status: number }
}

function problemsOf(error: unknown): Problem[] | null {
  if (!error || typeof error !== 'object' || !('detail' in error)) return null
  const d = (error as { detail: unknown }).detail
  if (d && typeof d === 'object' && 'problems' in d && Array.isArray((d as { problems: unknown }).problems)) {
    return (d as { problems: Problem[] }).problems
  }
  return null
}

/** `handle` plus: 422 problems → ConfigProblemsError; 503 → ClinicSimUnavailableError. */
function unwrap<T>(qc: QueryClient, result: ApiResult<T>): T {
  const status = result.response.status
  if (status === 422) {
    const problems = problemsOf(result.error)
    if (problems) throw new ConfigProblemsError(422, problems)
  }
  if (status === 503) {
    const d = result.error && typeof result.error === 'object' && 'detail' in result.error
      ? (result.error as { detail: unknown }).detail
      : null
    throw new ClinicSimUnavailableError(typeof d === 'string' ? d : null)
  }
  return handle(qc, result)
}

/** Unreachable/forbidden/missing answers are final; anything else may retry once. */
function retry(count: number, error: unknown) {
  if (error instanceof AdminApiError && error.status < 500) return false
  if (error instanceof ClinicSimUnavailableError) return false
  return count < 1
}

export const clinicSimKeys = {
  all: ['admin', 'clinic-sim'] as const,
  info: () => ['admin', 'clinic-sim', 'info'] as const,
  departments: () => ['admin', 'clinic-sim', 'departments'] as const,
  providers: (departmentId?: number) => ['admin', 'clinic-sim', 'providers', { departmentId }] as const,
  availability: (params: ClinicAvailabilityParams) => ['admin', 'clinic-sim', 'availability', params] as const,
  patients: (params: ClinicPatientsParams) => ['admin', 'clinic-sim', 'patients', params] as const,
  appointments: (params: ClinicAppointmentsParams) => ['admin', 'clinic-sim', 'appointments', params] as const,
}

export function useClinicInfo() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: clinicSimKeys.info(),
    queryFn: async () => unwrap(qc, await api.GET('/api/admin/clinic-sim/info')),
    staleTime: 5 * 60_000,
    retry,
  })
}

export function useClinicDepartments() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: clinicSimKeys.departments(),
    queryFn: async () => unwrap(qc, await api.GET('/api/admin/clinic-sim/departments')),
    retry,
  })
}

/** Providers, optionally of one department. */
export function useClinicProviders(departmentId?: number) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: clinicSimKeys.providers(departmentId),
    queryFn: async () =>
      unwrap(
        qc,
        await api.GET('/api/admin/clinic-sim/providers', {
          params: { query: departmentId === undefined ? {} : { department_id: departmentId } },
        }),
      ),
    retry,
  })
}

/** Free slots; pass `enabled=false` until a department and date are chosen. */
export function useClinicAvailability(params: ClinicAvailabilityParams, enabled = true) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: clinicSimKeys.availability(params),
    queryFn: async () => unwrap(qc, await api.GET('/api/admin/clinic-sim/availability', { params: { query: params } })),
    enabled,
    retry,
  })
}

/** Patient search (a POST so the text stays out of access logs, but cached as a query). */
export function useClinicPatients(params: ClinicPatientsParams, enabled = true) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: clinicSimKeys.patients(params),
    queryFn: async () =>
      unwrap(
        qc,
        await api.POST('/api/admin/clinic-sim/patients/search', {
          body: { q: params.q ? params.q : null, limit: params.limit, offset: params.offset },
        }),
      ),
    placeholderData: keepPreviousData,
    enabled,
    retry,
  })
}

export function useClinicAppointments(params: ClinicAppointmentsParams) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: clinicSimKeys.appointments(params),
    queryFn: async () => unwrap(qc, await api.GET('/api/admin/clinic-sim/appointments', { params: { query: params } })),
    placeholderData: keepPreviousData,
    retry,
  })
}

/** Every clinic-sim query refetches after any write (and after a 404/409, so stale lists refresh). */
function clinicChanged(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: clinicSimKeys.all })
}

function refreshOnConflict(qc: QueryClient, error: unknown) {
  if (error instanceof AdminApiError && (error.status === 404 || error.status === 409)) void clinicChanged(qc)
}

export function useCreateClinicPatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: ClinicPatientCreate) =>
      unwrap(qc, await api.POST('/api/admin/clinic-sim/patients', { body })),
    onSuccess: () => clinicChanged(qc),
    onError: (e) => refreshOnConflict(qc, e),
  })
}

export function useUpdateClinicPatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ClinicPatientUpdate }) =>
      unwrap(
        qc,
        await api.PATCH('/api/admin/clinic-sim/patients/{patient_id}', { params: { path: { patient_id: id } }, body }),
      ),
    onSuccess: () => clinicChanged(qc),
    onError: (e) => refreshOnConflict(qc, e),
  })
}

/** Soft delete; the sim also cancels the patient's upcoming appointments. */
export function useDeleteClinicPatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        qc,
        await api.POST('/api/admin/clinic-sim/patients/{patient_id}/delete', {
          params: { path: { patient_id: id } },
          body: {},
        }),
      ),
    onSuccess: () => clinicChanged(qc),
    onError: (e) => refreshOnConflict(qc, e),
  })
}

export function useBookClinicAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: ClinicAppointmentCreate) =>
      unwrap(qc, await api.POST('/api/admin/clinic-sim/appointments', { body })),
    onSuccess: () => clinicChanged(qc),
    onError: (e) => refreshOnConflict(qc, e),
  })
}

export function useRescheduleClinicAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ClinicAppointmentReschedule }) =>
      unwrap(
        qc,
        await api.PATCH('/api/admin/clinic-sim/appointments/{appointment_id}', {
          params: { path: { appointment_id: id } },
          body,
        }),
      ),
    onSuccess: () => clinicChanged(qc),
    onError: (e) => refreshOnConflict(qc, e),
  })
}

export function useCancelClinicAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        qc,
        await api.POST('/api/admin/clinic-sim/appointments/{appointment_id}/cancel', {
          params: { path: { appointment_id: id } },
          body: {},
        }),
      ),
    onSuccess: () => clinicChanged(qc),
    onError: (e) => refreshOnConflict(qc, e),
  })
}
