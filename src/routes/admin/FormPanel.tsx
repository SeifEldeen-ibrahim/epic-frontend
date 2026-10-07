import { useId, useState } from 'react'
import { adminCopy, formStatusTone, formatTime, label, yesNo } from '../../admin/copy'
import { useApprove, useEditField, useReject, type CallDetail, type FormDetail } from '../../api/admin'
import { SelectField } from '../../admin/DataTable'
import { Button, StatusBadge, TextField } from '../../ui'

const c = adminCopy.detail

export type HistoryItem = CallDetail['field_history'][number]

type Kind = 'text' | 'bool' | 'list' | 'enum' | 'number' | 'date'
interface FieldSpec {
  name: string
  kind: Kind
  value: unknown
  /** From the form definition (the version the call ran on). */
  label?: string
  options?: readonly string[]
}

const COLUMNS = new Set(['caller_relationship', 'insurance_carrier_verbatim', 'documents_held'])

const TYPED: readonly { name: string; kind: Kind }[] = [
  { name: 'caller_relationship', kind: 'text' },
  { name: 'insurance_carrier_verbatim', kind: 'text' },
  { name: 'callback_number', kind: 'text' },
  { name: 'callback_consent', kind: 'bool' },
  { name: 'documents_held', kind: 'list' },
]

function fieldLabel(name: string, spec?: { label?: string }): string {
  if (spec?.label) return spec.label
  const known: Record<string, string> = c.fieldLabels
  return known[name] ?? label(name)
}

/** Human text for a stored JSON value. */
function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return adminCopy.dash
  if (Array.isArray(value)) return value.length ? value.map(String).join(', ') : adminCopy.dash
  if (typeof value === 'boolean') return yesNo(value)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function specsFor(form: FormDetail): FieldSpec[] {
  const def = form.definition
  if (def) {
    // Generic: the fields of this call's form version, in order, plus the callback block.
    const fromDef: FieldSpec[] = def.fields.map((f) => ({
      name: f.key,
      kind: (['text', 'bool', 'list', 'enum', 'number', 'date'].includes(f.type) ? f.type : 'text') as Kind,
      value: COLUMNS.has(f.key) ? (form[f.key as keyof FormDetail] ?? null) : (form.fields[f.key] ?? null),
      label: f.label,
      options: f.values,
    }))
    return [
      ...fromDef,
      { name: 'callback_number', kind: 'text', value: form.callback_number ?? null },
      { name: 'callback_consent', kind: 'bool', value: form.callback_consent ?? null },
    ]
  }
  const typed = TYPED.map((t) => ({ ...t, value: form[t.name as keyof FormDetail] ?? null }))
  const names = new Set(TYPED.map((t) => t.name))
  const extra = Object.entries(form.fields)
    .filter(([name, v]) => typeof v === 'string' && !names.has(name))
    .map(([name, value]) => ({ name, kind: 'text' as const, value }))
  return [...typed, ...extra]
}

function initialDraft(spec: FieldSpec): string {
  if (spec.kind === 'bool') return spec.value === true ? 'true' : 'false'
  if (spec.kind === 'list') return Array.isArray(spec.value) ? spec.value.map(String).join(', ') : ''
  if (spec.kind === 'number') return typeof spec.value === 'number' ? String(spec.value) : ''
  return typeof spec.value === 'string' ? spec.value : ''
}

function toValue(spec: FieldSpec, draft: string): unknown {
  if (spec.kind === 'bool') return draft === 'true'
  if (spec.kind === 'list')
    return draft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  if (spec.kind === 'number') return draft.trim() === '' ? null : Number(draft)
  return draft === '' && (spec.value === null || spec.kind !== 'text') ? null : draft
}

function FieldEditor({
  spec,
  pending,
  onSave,
}: {
  spec: FieldSpec
  pending: boolean
  onSave: (field: string, old: unknown, next: unknown) => void
}) {
  const [draft, setDraft] = useState(() => initialDraft(spec))
  const name = fieldLabel(spec.name, spec)
  const save = (
    <Button
      variant="secondary"
      data-testid={`field-save-${spec.name}`}
      aria-label={c.saveField(name)}
      disabled={pending}
      onClick={() => onSave(spec.name, spec.value, toValue(spec, draft))}
    >
      {c.save}
    </Button>
  )
  if (spec.kind === 'bool') {
    return (
      <div className="admin-field-row">
        <label className="admin-checkbox">
          <input
            type="checkbox"
            checked={draft === 'true'}
            onChange={(e) => setDraft(String(e.target.checked))}
            data-testid={`field-${spec.name}`}
          />
          {name}
        </label>
        {save}
      </div>
    )
  }
  if (spec.kind === 'enum' && spec.options) {
    return (
      <div className="admin-field-row">
        <SelectField
          label={name}
          value={draft}
          onChange={setDraft}
          options={[{ value: '', label: adminCopy.dash }, ...spec.options.map((o) => ({ value: o, label: label(o) }))]}
          testId={`field-${spec.name}`}
        />
        {save}
      </div>
    )
  }
  return (
    <div className="admin-field-row">
      <TextField
        label={name}
        hint={spec.kind === 'list' ? c.listHint : undefined}
        type={spec.kind === 'date' ? 'date' : 'text'}
        inputMode={spec.kind === 'number' ? 'numeric' : undefined}
        value={draft}
        maxLength={spec.kind === 'text' ? 500 : undefined}
        onChange={(e) => setDraft(e.target.value)}
        data-testid={`field-${spec.name}`}
      />
      {save}
    </div>
  )
}

interface PanelProps {
  callId: string
  form: FormDetail | null
  outcome: string | null
  readOnly: boolean
  flagsOpen: boolean
  history: HistoryItem[]
  staffEmail: string | null
  onDone: (text: string) => void
  onError: (error: unknown) => void
  onEdited: (item: HistoryItem) => void
}

export function FormPanel(props: PanelProps) {
  const headingId = useId()
  const { form, outcome } = props
  return (
    <section className="admin-panel admin-section admin-detail__form" aria-labelledby={headingId} data-testid="detail-form">
      <h2 id={headingId}>{c.form}</h2>
      {form ? (
        <FormBody {...props} form={form} />
      ) : (
        <p data-testid="detail-no-form">{outcome ? c.noForm(label(outcome).toLowerCase()) : c.noFormYet}</p>
      )}
    </section>
  )
}

function FormBody({
  callId,
  form,
  readOnly,
  flagsOpen,
  history,
  staffEmail,
  onDone,
  onError,
  onEdited,
}: PanelProps & { form: FormDetail }) {
  const edit = useEditField(callId)
  const approve = useApprove(callId)
  const reject = useReject(callId)
  const hintId = useId()
  const reasonId = useId()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const editable = !readOnly && form.status === 'awaiting_approval'
  const specs = specsFor(form)

  const save = (field: string, old: unknown, next: unknown) =>
    edit.mutate(
      { field, old, new: next },
      {
        onSuccess: () => {
          onEdited({
            at: new Date().toISOString(),
            field,
            old,
            new: next,
            source: 'staff' as HistoryItem['source'],
            staff_email: staffEmail,
          })
          onDone(c.saved(fieldLabel(field, specs.find((s) => s.name === field))))
        },
        onError,
      },
    )

  const confirmReject = () => {
    const text = reason.trim()
    if (text.length === 0) return setReasonError(c.reasonRequired)
    if (text.length > 500) return setReasonError(c.reasonTooLong)
    setReasonError(null)
    reject.mutate(text, {
      onSuccess: () => {
        setRejecting(false)
        setReason('')
        onDone(c.rejected)
      },
      onError,
    })
  }

  return (
    <>
      <div className="admin-actions">
        <StatusBadge tone={formStatusTone(form.status)}>{label(form.status)}</StatusBadge>
        {form.after_hours_queued ? <span className="admin-muted">{c.afterHoursQueued}</span> : null}
      </div>
      <dl className="admin-facts">
        <div className="admin-facts__item">
          <dt>{c.submitted}</dt>
          <dd>{formatTime(form.submitted_at)}</dd>
        </div>
        {form.decided_at ? (
          <div className="admin-facts__item">
            <dt>{c.decided}</dt>
            <dd>
              {formatTime(form.decided_at)}
              {form.decided_by_email ? ` · ${form.decided_by_email}` : ''}
            </dd>
          </div>
        ) : null}
        {form.exported_at ? (
          <div className="admin-facts__item">
            <dt>{c.exported}</dt>
            <dd>{formatTime(form.exported_at)}</dd>
          </div>
        ) : null}
        {form.reject_reason ? (
          <div className="admin-facts__item">
            <dt>{c.rejectReasonShown}</dt>
            <dd data-testid="detail-reject-reason">{form.reject_reason}</dd>
          </div>
        ) : null}
      </dl>
      {editable ? (
        <div className="admin-detail__fields">
          {specs.map((s) => (
            <FieldEditor key={`${s.name}:${JSON.stringify(s.value)}`} spec={s} pending={edit.isPending} onSave={save} />
          ))}
        </div>
      ) : (
        <dl className="admin-facts">
          {specs.map((s) => (
            <div className="admin-facts__item" key={s.name}>
              <dt>{fieldLabel(s.name, s)}</dt>
              <dd>{display(s.value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {editable ? (
        <>
          <div className="admin-actions">
            <Button
              data-testid="form-approve"
              disabled={flagsOpen || approve.isPending}
              aria-describedby={flagsOpen ? hintId : undefined}
              onClick={() => approve.mutate(undefined, { onSuccess: () => onDone(c.approved), onError })}
            >
              {approve.isPending ? c.approving : c.approve}
            </Button>
            <Button
              variant="secondary"
              data-testid="form-reject"
              aria-expanded={rejecting}
              onClick={() => setRejecting((r) => !r)}
            >
              {c.reject}
            </Button>
          </div>
          {flagsOpen ? (
            <p id={hintId} className="admin-muted" data-testid="form-approve-hint">
              {c.approveHint}
            </p>
          ) : null}
          {rejecting ? (
            <div className="admin-section">
              <label className="ui-field__label" htmlFor={reasonId}>
                {c.rejectReason}
              </label>
              <textarea
                id={reasonId}
                className="ui-input admin-textarea"
                rows={3}
                required
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-invalid={reasonError ? true : undefined}
                aria-describedby={reasonError ? `${reasonId}-error` : undefined}
                data-testid="form-reject-reason"
              />
              {reasonError ? (
                <p className="ui-field__error" id={`${reasonId}-error`} data-testid="form-reject-error">
                  {reasonError}
                </p>
              ) : null}
              <div className="admin-actions">
                <Button data-testid="form-reject-confirm" disabled={reject.isPending} onClick={confirmReject}>
                  {reject.isPending ? c.rejecting : c.confirmReject}
                </Button>
                <Button variant="secondary" onClick={() => setRejecting(false)}>
                  {c.cancel}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <h3>{c.history}</h3>
      {history.length ? (
        <ol className="admin-plain-list" data-testid="detail-history">
          {history.map((h, i) => (
            <li key={`${h.at}-${h.field}-${i}`}>
              <strong>{fieldLabel(h.field)}</strong>: {display(h.old)} → {display(h.new)}{' '}
              <span className="admin-muted">
                · {label(h.source)} · {h.staff_email ?? adminCopy.dash} · <time dateTime={h.at}>{formatTime(h.at)}</time>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="admin-muted" data-testid="detail-history">
          {c.historyEmpty}
        </p>
      )}
    </>
  )
}
