import { useState, type FormEvent } from 'react'
import {
  isClinicSimUnavailable,
  isRecordGone,
  useClinicPatients,
  useCreateClinicPatient,
  useDeleteClinicPatient,
  useUpdateClinicPatient,
  type ClinicPatient,
} from '../../api/clinicSim'
import { ConfigProblemsError } from '../../api/config'
import { ConfirmDialog } from '../../admin/ConfirmDialog'
import { DataTable, Pager, type Column } from '../../admin/DataTable'
import { RecordFields, type FieldDef, type Rec } from '../../admin/EditDialog'
import { adminCopy, clinicPatientName as patientName } from '../../admin/copy'
import { missingRequired, plainMessage } from '../../admin/problems'
import { Button, EmptyState, ErrorState, Notice, TextField } from '../../ui'

const c = adminCopy.clinicSim
const p = c.patients
const PAGE = 20

const FIELDS: readonly FieldDef[] = [
  { key: 'first_name', label: p.fields.first_name, kind: 'text', required: true, max: 100 },
  { key: 'last_name', label: p.fields.last_name, kind: 'text', required: true, max: 100 },
  { key: 'date_of_birth', label: p.fields.date_of_birth, kind: 'text', required: true, hint: p.fields.dobHint, max: 10 },
  { key: 'phone', label: p.fields.phone, kind: 'text', required: true, max: 32 },
  { key: 'email', label: p.fields.email, kind: 'text', max: 254 },
]
const KEYS = FIELDS.map((f) => f.key)

/** The sim's 422 problems keyed by the form field their path ends in. */
function errorsByField(error: unknown): Record<string, string> {
  if (!(error instanceof ConfigProblemsError)) return {}
  const out: Record<string, string> = {}
  for (const pr of error.problems) {
    const key = pr.path
      .split('.')
      .reverse()
      .find((s) => KEYS.includes(s))
    if (key && !out[key]) out[key] = plainMessage(pr.message)
  }
  return out
}

function toBody(v: Rec) {
  const text = (k: string) => String(v[k] ?? '').trim()
  return {
    first_name: text('first_name'),
    last_name: text('last_name'),
    date_of_birth: text('date_of_birth'),
    phone: text('phone'),
    email: text('email') || null,
  }
}

type Editing = { mode: 'add' } | { mode: 'edit'; patient: ClinicPatient }

/** Add or edit one patient; saves straight to the clinic sim. */
function PatientDialog({ editing, onDone, onGone }: { editing: Editing; onDone: () => void; onGone: () => void }) {
  const create = useCreateClinicPatient()
  const update = useUpdateClinicPatient()
  const [value, setValue] = useState<Rec>(() =>
    editing.mode === 'edit'
      ? { ...editing.patient, email: editing.patient.email ?? '' }
      : Object.fromEntries(KEYS.map((k) => [k, ''])),
  )
  const [error, setError] = useState<unknown>(null)
  const saving = create.isPending || update.isPending
  const missing = missingRequired(FIELDS, value)
  const errors = errorsByField(error)
  const save = () => {
    setError(null)
    const onError = (e: unknown) => (isRecordGone(e) ? onGone() : setError(e))
    if (editing.mode === 'add') create.mutate(toBody(value), { onSuccess: onDone, onError })
    else update.mutate({ id: editing.patient.id, body: toBody(value) }, { onSuccess: onDone, onError })
  }
  return (
    <ConfirmDialog
      open
      title={editing.mode === 'add' ? p.addTitle : p.editTitle(patientName(editing.patient))}
      confirmLabel={saving ? c.saving : c.save}
      cancelLabel={c.cancel}
      busy={saving}
      confirmDisabled={missing.length > 0}
      onConfirm={save}
      onCancel={onDone}
      testId="clinic-patient-dialog"
    >
      <RecordFields fields={FIELDS} value={value} onChange={setValue} testPrefix="clinic-patient" creating disabled={saving} errors={errors} />
      {missing.length ? (
        <p className="admin-muted" data-testid="clinic-patient-missing">
          {adminCopy.fields.fillIn(missing.join(', '))}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field__error" role="alert" data-testid="clinic-patient-error">
          {isClinicSimUnavailable(error) ? c.unreachable : Object.keys(errors).length ? c.fixFields : c.saveFailed}
        </p>
      ) : null}
    </ConfirmDialog>
  )
}

/** Confirms, then soft-deletes a patient (the sim cancels their upcoming appointments). */
function DeleteDialog({ patient, onDone, onGone }: { patient: ClinicPatient; onDone: () => void; onGone: () => void }) {
  const del = useDeleteClinicPatient()
  const [error, setError] = useState<unknown>(null)
  return (
    <ConfirmDialog
      open
      title={p.deleteTitle}
      confirmLabel={del.isPending ? p.deleting : p.delete}
      cancelLabel={c.cancel}
      busy={del.isPending}
      onConfirm={() => {
        setError(null)
        del.mutate(patient.id, { onSuccess: onDone, onError: (e) => (isRecordGone(e) ? onGone() : setError(e)) })
      }}
      onCancel={onDone}
      testId="clinic-delete-dialog"
    >
      <p>{p.deleteBody(patientName(patient))}</p>
      {error ? (
        <p className="ui-field__error" role="alert">
          {isClinicSimUnavailable(error) ? c.unreachable : p.deleteFailed}
        </p>
      ) : null}
    </ConfirmDialog>
  )
}

export function ClinicSimPatients() {
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleting, setDeleting] = useState<ClinicPatient | null>(null)
  const [gone, setGone] = useState(false)
  const list = useClinicPatients({ q: q || null, limit: PAGE, offset })

  const search = (e: FormEvent) => {
    e.preventDefault()
    setQ(text.trim())
    setOffset(0)
  }
  const onGone = () => {
    setEditing(null)
    setDeleting(null)
    setGone(true)
  }

  const columns: Column<ClinicPatient>[] = [
    { key: 'name', header: p.cols.name, cell: (r) => patientName(r) },
    { key: 'dob', header: p.cols.dob, cell: (r) => r.date_of_birth },
    { key: 'phone', header: p.cols.phone, cell: (r) => r.phone },
    { key: 'mrn', header: p.cols.mrn, cell: (r) => r.mrn },
    {
      key: 'actions',
      header: c.actions,
      cell: (r) => (
        <div className="admin-actions admin-actions--nowrap">
          <Button variant="secondary" aria-label={p.editLabel(patientName(r))} onClick={() => setEditing({ mode: 'edit', patient: r })} data-testid={`clinic-patient-edit-${r.id}`}>
            {p.edit}
          </Button>
          <Button variant="secondary" aria-label={p.deleteLabel(patientName(r))} onClick={() => setDeleting(r)} data-testid={`clinic-patient-delete-${r.id}`}>
            {p.delete}
          </Button>
        </div>
      ),
    },
  ]

  let body
  if (list.isPending) body = <DataTable name="clinic-patients" caption={p.caption} columns={columns} loading />
  else if (!list.data) {
    const down = isClinicSimUnavailable(list.error)
    body = (
      <ErrorState
        message={down ? c.unreachable : p.error}
        onRetry={() => void list.refetch()}
        data-testid={down ? 'clinic-unreachable' : 'clinic-patients-error'}
      />
    )
  } else if (list.data.items.length === 0)
    body = q ? (
      <EmptyState title={p.filteredEmpty} data-testid="clinic-patients-filtered-empty">
        {p.filteredEmptyBody}
      </EmptyState>
    ) : (
      <EmptyState title={p.empty} data-testid="clinic-patients-empty">
        {p.emptyBody}
      </EmptyState>
    )
  else body = <DataTable name="clinic-patients" caption={p.caption} columns={columns} rows={list.data.items} rowKey={(r) => r.id} />

  const total = list.data?.total ?? 0
  return (
    <>
      <div className="admin-actions">
        <Button onClick={() => setEditing({ mode: 'add' })} data-testid="clinic-patient-add">
          {p.add}
        </Button>
      </div>
      <form className="admin-filters" role="search" aria-label={p.search} onSubmit={search} data-testid="clinic-patient-search">
        <TextField label={p.search} hint={p.searchHint} value={text} maxLength={100} onChange={(e) => setText(e.target.value)} data-testid="clinic-patient-q" />
        <div className="admin-actions admin-filters__actions">
          <Button type="submit" data-testid="clinic-patient-search-submit">
            {p.searchButton}
          </Button>
          {q ? (
            <Button
              variant="secondary"
              onClick={() => {
                setText('')
                setQ('')
                setOffset(0)
              }}
              data-testid="clinic-patient-search-clear"
            >
              {p.clearSearch}
            </Button>
          ) : null}
        </div>
      </form>
      {gone ? (
        <div role="alert" data-testid="clinic-gone">
          <Notice tone="warning">{c.gone}</Notice>
        </div>
      ) : null}
      {body}
      <Pager
        name="clinic-patients"
        hasPrevious={offset > 0}
        hasNext={offset + PAGE < total}
        onPrevious={() => setOffset(Math.max(0, offset - PAGE))}
        onNext={() => setOffset(offset + PAGE)}
      />
      {editing ? <PatientDialog key={editing.mode === 'edit' ? editing.patient.id : 'add'} editing={editing} onDone={() => setEditing(null)} onGone={onGone} /> : null}
      {deleting ? <DeleteDialog key={deleting.id} patient={deleting} onDone={() => setDeleting(null)} onGone={onGone} /> : null}
    </>
  )
}
