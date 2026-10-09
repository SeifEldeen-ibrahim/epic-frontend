import { useState } from 'react'
import {
  isClinicSimUnavailable,
  isRecordGone,
  useCancelClinicAppointment,
  useClinicAppointments,
  useClinicDepartments,
  useClinicInfo,
  useClinicPatients,
  type ClinicAppointment,
  type ClinicAppointmentsParams,
} from '../../api/clinicSim'
import { ConfirmDialog } from '../../admin/ConfirmDialog'
import { DataTable, Pager, SelectField, type Column } from '../../admin/DataTable'
import { adminCopy, clinicPatientName, formatClinicTime } from '../../admin/copy'
import { Button, EmptyState, ErrorState, Notice, StatusBadge } from '../../ui'
import { ClinicSimBookDialog, type BookMode } from './ClinicSimBookDialog'

const c = adminCopy.clinicSim
const a = c.appointments
const PAGE = 20
type Status = 'booked' | 'cancelled'

/** Confirms, then cancels one appointment. */
function CancelDialog({
  appointment,
  patientLabel,
  when,
  onDone,
  onGone,
}: {
  appointment: ClinicAppointment
  patientLabel: string
  when: string
  onDone: () => void
  onGone: () => void
}) {
  const cancel = useCancelClinicAppointment()
  const [error, setError] = useState<unknown>(null)
  return (
    <ConfirmDialog
      open
      title={a.cancelTitle}
      confirmLabel={cancel.isPending ? a.cancelling : a.cancelConfirm}
      cancelLabel={a.keep}
      busy={cancel.isPending}
      onConfirm={() => {
        setError(null)
        cancel.mutate(appointment.id, { onSuccess: onDone, onError: (e) => (isRecordGone(e) ? onGone() : setError(e)) })
      }}
      onCancel={onDone}
      testId="clinic-cancel-dialog"
    >
      <p>{a.cancelBody(patientLabel, when)}</p>
      {error ? (
        <p className="ui-field__error" role="alert">
          {isClinicSimUnavailable(error) ? c.unreachable : a.cancelFailed}
        </p>
      ) : null}
    </ConfirmDialog>
  )
}

export function ClinicSimAppointments() {
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState('')
  const [show, setShow] = useState<'upcoming' | 'all'>('upcoming')
  const [offset, setOffset] = useState(0)
  // Fixed when the tab opens, so the list's query stays stable between renders.
  const [now] = useState(() => new Date().toISOString())
  const [dialog, setDialog] = useState<BookMode | null>(null)
  const [cancelling, setCancelling] = useState<ClinicAppointment | null>(null)
  const [gone, setGone] = useState(false)

  const info = useClinicInfo()
  const tz = info.data?.time_zone
  const departments = useClinicDepartments()
  // Names for the patient column: the sim's first page of patients (up to 100).
  const patients = useClinicPatients({ q: null, limit: 100, offset: 0 })
  const params: ClinicAppointmentsParams = { limit: PAGE, offset }
  if (department) params.department_id = Number(department)
  if (status) params.status = status as Status
  if (show === 'upcoming') params.from = now
  const list = useClinicAppointments(params)
  const filtered = department !== '' || status !== ''

  const nameOf = (r: ClinicAppointment) => {
    const p = patients.data?.items.find((x) => x.id === r.patient_id)
    return p ? clinicPatientName(p) : c.patients.unknown(r.patient_id)
  }
  const departmentOf = (id: number) => departments.data?.find((d) => d.id === id)?.name ?? adminCopy.dash
  const when = (r: ClinicAppointment) => formatClinicTime(r.starts_at, tz)
  const onGone = () => {
    setDialog(null)
    setCancelling(null)
    setGone(true)
  }
  const filter = (set: (v: string) => void) => (v: string) => {
    set(v)
    setOffset(0)
  }

  const columns: Column<ClinicAppointment>[] = [
    { key: 'when', header: a.cols.when, cell: (r) => <span className="admin-nowrap">{when(r)}</span> },
    { key: 'patient', header: a.cols.patient, cell: nameOf },
    { key: 'department', header: a.cols.department, cell: (r) => departmentOf(r.department_id) },
    { key: 'provider', header: a.cols.provider, cell: (r) => r.provider_name },
    { key: 'type', header: a.cols.type, cell: (r) => a.visitTypes[r.visit_type] ?? r.visit_type },
    {
      key: 'status',
      header: a.cols.status,
      cell: (r) => <StatusBadge tone={r.status === 'booked' ? 'ok' : 'warning'}>{a.statuses[r.status] ?? r.status}</StatusBadge>,
    },
    {
      key: 'actions',
      header: c.actions,
      cell: (r) =>
        r.status === 'booked' ? (
          <div className="admin-actions admin-actions--nowrap">
            <Button
              variant="secondary"
              aria-label={a.rescheduleLabel(when(r))}
              onClick={() => setDialog({ mode: 'reschedule', appointment: r, patientLabel: nameOf(r) })}
              data-testid={`clinic-appt-reschedule-${r.id}`}
            >
              {a.reschedule}
            </Button>
            <Button variant="secondary" aria-label={a.cancelLabel(when(r))} onClick={() => setCancelling(r)} data-testid={`clinic-appt-cancel-${r.id}`}>
              {a.cancel}
            </Button>
          </div>
        ) : (
          adminCopy.dash
        ),
    },
  ]

  let body
  if (list.isPending) body = <DataTable name="clinic-appointments" caption={a.caption} columns={columns} loading />
  else if (!list.data) {
    const down = isClinicSimUnavailable(list.error)
    body = (
      <ErrorState
        message={down ? c.unreachable : a.error}
        onRetry={() => void list.refetch()}
        data-testid={down ? 'clinic-unreachable' : 'clinic-appointments-error'}
      />
    )
  } else if (list.data.items.length === 0)
    body = filtered ? (
      <EmptyState title={a.filteredEmpty} data-testid="clinic-appointments-filtered-empty">
        {a.filteredEmptyBody}
      </EmptyState>
    ) : (
      <EmptyState title={a.empty} data-testid="clinic-appointments-empty">
        {a.emptyBody}
      </EmptyState>
    )
  else body = <DataTable name="clinic-appointments" caption={a.caption} columns={columns} rows={list.data.items} rowKey={(r) => r.id} />

  const any = { value: '', label: adminCopy.any }
  const total = list.data?.total ?? 0
  return (
    <>
      <div className="admin-actions">
        <Button onClick={() => setDialog({ mode: 'book' })} data-testid="clinic-book">
          {a.book}
        </Button>
      </div>
      <div className="admin-filters" role="group" aria-label={a.filters} data-testid="clinic-appointment-filters">
        <SelectField
          label={a.department}
          value={department}
          onChange={filter(setDepartment)}
          options={[any, ...(departments.data ?? []).map((d) => ({ value: String(d.id), label: d.name }))]}
          testId="clinic-filter-department"
        />
        <SelectField
          label={a.status}
          value={status}
          onChange={filter(setStatus)}
          options={[any, ...(['booked', 'cancelled'] as const).map((s) => ({ value: s, label: a.statuses[s] }))]}
          testId="clinic-filter-status"
        />
        <SelectField
          label={a.show}
          value={show}
          onChange={filter((v) => setShow(v === 'all' ? 'all' : 'upcoming'))}
          options={[
            { value: 'upcoming', label: a.upcoming },
            { value: 'all', label: a.all },
          ]}
          testId="clinic-filter-show"
        />
      </div>
      {gone ? (
        <div role="alert" data-testid="clinic-gone">
          <Notice tone="warning">{c.gone}</Notice>
        </div>
      ) : null}
      {body}
      <Pager
        name="clinic-appointments"
        hasPrevious={offset > 0}
        hasNext={offset + PAGE < total}
        onPrevious={() => setOffset(Math.max(0, offset - PAGE))}
        onNext={() => setOffset(offset + PAGE)}
      />
      {dialog ? (
        <ClinicSimBookDialog
          key={dialog.mode === 'reschedule' ? dialog.appointment.id : 'book'}
          spec={dialog}
          timeZone={tz}
          onDone={() => setDialog(null)}
          onGone={onGone}
        />
      ) : null}
      {cancelling ? (
        <CancelDialog
          key={cancelling.id}
          appointment={cancelling}
          patientLabel={nameOf(cancelling)}
          when={when(cancelling)}
          onDone={() => setCancelling(null)}
          onGone={onGone}
        />
      ) : null}
    </>
  )
}
