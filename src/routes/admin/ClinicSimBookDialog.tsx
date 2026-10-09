import { useState } from 'react'
import {
  isClinicSimUnavailable,
  isRecordGone,
  isSlotTaken,
  useBookClinicAppointment,
  useClinicAvailability,
  useClinicDepartments,
  useClinicPatients,
  useRescheduleClinicAppointment,
  type ClinicAppointment,
  type ClinicFreeSlot,
  type ClinicPatient,
  type ClinicVisitType,
} from '../../api/clinicSim'
import { ConfirmDialog } from '../../admin/ConfirmDialog'
import { SelectInput } from '../../admin/EditDialog'
import { adminCopy, clinicPatientName, formatClinicClock, formatClinicTime, todayIn } from '../../admin/copy'
import { Spinner, TextArea, TextField } from '../../ui'

const c = adminCopy.clinicSim
const b = c.book

export type BookMode = { mode: 'book' } | { mode: 'reschedule'; appointment: ClinicAppointment; patientLabel: string }

type Slot = Pick<ClinicFreeSlot, 'provider_id' | 'starts_at'>
const sameSlot = (a: Slot | null, s: Slot) => !!a && a.provider_id === s.provider_id && a.starts_at === s.starts_at

/** Book (patient → department → date → free time → visit type) or move an appointment.
 * The submit button is the confirmation; a time taken meanwhile keeps the dialog open. */
export function ClinicSimBookDialog({
  spec,
  timeZone,
  onDone,
  onGone,
}: {
  spec: BookMode
  timeZone: string | undefined
  onDone: () => void
  onGone: () => void
}) {
  const reschedule = spec.mode === 'reschedule' ? spec.appointment : null
  const [search, setSearch] = useState('')
  const [patient, setPatient] = useState<ClinicPatient | null>(null)
  const [department, setDepartment] = useState(reschedule ? String(reschedule.department_id) : '')
  const [date, setDate] = useState(() => todayIn(timeZone, new Date()))
  const [slot, setSlot] = useState<Slot | null>(null)
  const [visitType, setVisitType] = useState<ClinicVisitType>('new_patient')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const departments = useClinicDepartments()
  const patients = useClinicPatients({ q: search.trim() || null, limit: 10, offset: 0 }, !reschedule)
  const slotsOn = department !== '' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  const slots = useClinicAvailability({ department_id: Number(department), date_from: date, date_to: date }, slotsOn)
  const book = useBookClinicAppointment()
  const move = useRescheduleClinicAppointment()
  const busy = book.isPending || move.isPending

  const onError = (e: unknown) => {
    if (isSlotTaken(e)) {
      setSlot(null)
      setMessage(b.taken)
    } else if (isRecordGone(e)) onGone()
    else setMessage(isClinicSimUnavailable(e) ? c.unreachable : b.failed)
  }
  const submit = () => {
    if (!slot) return
    setMessage(null)
    if (reschedule) {
      move.mutate({ id: reschedule.id, body: { starts_at: slot.starts_at, provider_id: slot.provider_id } }, { onSuccess: onDone, onError })
    } else if (patient) {
      book.mutate(
        {
          patient_id: patient.id,
          department_id: Number(department),
          provider_id: slot.provider_id,
          starts_at: slot.starts_at,
          visit_type: visitType,
          note: note.trim() || null,
        },
        { onSuccess: onDone, onError },
      )
    }
  }

  const patientOptions = [
    { value: '', label: b.choosePatient },
    ...(patient && !patients.data?.items.some((x) => x.id === patient.id) ? [patient] : []).map((x) => ({ value: x.id, label: `${clinicPatientName(x)} · ${x.mrn}` })),
    ...(patients.data?.items ?? []).map((x) => ({ value: x.id, label: `${clinicPatientName(x)} · ${x.mrn}` })),
  ]

  let slotBody
  if (!slotsOn) slotBody = <p className="admin-muted">{b.slotsHint}</p>
  else if (slots.isPending) slotBody = <Spinner label={b.slotsLoading} />
  else if (!slots.data)
    slotBody = (
      <p className="ui-field__error" role="alert">
        {isClinicSimUnavailable(slots.error) ? c.unreachable : b.slotsError}
      </p>
    )
  else if (slots.data.length === 0) slotBody = <p className="admin-muted" data-testid="clinic-no-slots">{b.noSlots}</p>
  else
    slotBody = (
      <div className="admin-slots">
        {slots.data.map((s) => (
          <button
            key={`${s.provider_id}-${s.starts_at}`}
            type="button"
            className="admin-slot"
            aria-pressed={sameSlot(slot, s)}
            disabled={busy}
            onClick={() => {
              setSlot({ provider_id: s.provider_id, starts_at: s.starts_at })
              setMessage(null)
            }}
            data-testid="clinic-slot"
          >
            {b.slotLabel(formatClinicClock(s.starts_at, timeZone), s.provider_name)}
          </button>
        ))}
      </div>
    )

  const ready = !!slot && (reschedule ? true : !!patient && department !== '')
  return (
    <ConfirmDialog
      open
      title={reschedule ? b.rescheduleTitle : b.title}
      confirmLabel={reschedule ? (busy ? b.rescheduling : b.rescheduleSubmit) : busy ? b.submitting : b.submit}
      cancelLabel={c.cancel}
      busy={busy}
      confirmDisabled={!ready}
      onConfirm={submit}
      onCancel={onDone}
      testId="clinic-book-dialog"
    >
      <div className="admin-record">
        {spec.mode === 'reschedule' ? (
          <>
            <p>
              <strong>{spec.patientLabel}</strong>
            </p>
            <p className="admin-muted">{b.current(formatClinicTime(spec.appointment.starts_at, timeZone))}</p>
          </>
        ) : (
          <>
            <TextField
              label={b.patientSearch}
              hint={b.patientSearchHint}
              value={search}
              maxLength={100}
              disabled={busy}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="clinic-book-search"
            />
            <SelectInput
              label={b.patient}
              need="required"
              value={patient?.id ?? ''}
              options={patientOptions}
              disabled={busy}
              hint={patients.data && patients.data.items.length === 0 ? b.noPatients : undefined}
              onChange={(v) => setPatient(v ? (patients.data?.items.find((x) => x.id === v) ?? (patient?.id === v ? patient : null)) : null)}
              testId="clinic-book-patient"
            />
            <SelectInput
              label={b.department}
              need="required"
              value={department}
              options={[{ value: '', label: b.chooseDepartment }, ...(departments.data ?? []).map((d) => ({ value: String(d.id), label: d.name }))]}
              disabled={busy}
              onChange={(v) => {
                setDepartment(v)
                setSlot(null)
              }}
              testId="clinic-book-department"
            />
          </>
        )}
        <TextField
          label={b.date}
          type="date"
          need="required"
          value={date}
          disabled={busy}
          onChange={(e) => {
            setDate(e.target.value)
            setSlot(null)
          }}
          data-testid="clinic-book-date"
        />
        <fieldset className="admin-fieldset">
          <legend className="ui-field__label">{b.slots}</legend>
          {slotBody}
        </fieldset>
        {reschedule ? null : (
          <>
            <SelectInput
              label={b.visitType}
              need="required"
              value={visitType}
              options={(['new_patient', 'follow_up'] as const).map((v) => ({ value: v, label: c.appointments.visitTypes[v] }))}
              disabled={busy}
              onChange={(v) => setVisitType(v as ClinicVisitType)}
              testId="clinic-book-visit-type"
            />
            <TextArea label={b.note} need="optional" rows={2} max={500} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} data-testid="clinic-book-note" />
          </>
        )}
        {message ? (
          <p className="ui-field__error" role="alert" data-testid="clinic-book-message">
            {message}
          </p>
        ) : null}
      </div>
    </ConfirmDialog>
  )
}
