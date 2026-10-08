import { useId, useState, type ReactNode } from 'react'
import { Button, TextArea, TextField } from '../ui'
import { NeedMark, type FieldNeed } from '../ui/TextField'
import { ConfirmDialog } from './ConfirmDialog'
import { adminCopy } from './copy'
import { blankRecord, missingRequired, slugify } from './problems'

/** One editable property of a record (a routing row, a service, a referral, …). */
export interface FieldDef {
  key: string
  label: string
  kind: 'text' | 'textarea' | 'list' | 'select' | 'checkbox' | 'number'
  hint?: string
  options?: readonly { value: string; label: string }[]
  /** Text inputs: the server's limit (counter shown on textareas). */
  max?: number
  /** Read-only once created (e.g. a row's key). */
  fixedAfterCreate?: boolean
  /** Must be filled before saving (marked "*"); otherwise marked "(optional)". */
  required?: boolean
  /** While creating, this key follows the named field as a slug until it is edited. */
  slugFrom?: string
  /** Shown inside the "Advanced" disclosure. */
  advanced?: boolean
}

function needOf(f: FieldDef): FieldNeed | undefined {
  if (f.kind === 'checkbox') return undefined
  return f.required ? 'required' : 'optional'
}

export type Rec = Record<string, unknown>

function listToText(v: unknown): string {
  return Array.isArray(v) ? v.map(String).join(', ') : ''
}

function textToList(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Renders `fields` for `value`; lists are edited as comma-separated text. */
export function RecordFields({
  fields,
  value,
  onChange,
  testPrefix,
  creating = false,
  disabled = false,
  errors = {},
}: {
  fields: readonly FieldDef[]
  value: Rec
  onChange: (next: Rec) => void
  testPrefix: string
  creating?: boolean
  disabled?: boolean
  /** Plain-word problems keyed by field key, shown under that field. */
  errors?: Record<string, string>
}) {
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v })
  const render = (f: FieldDef) => {
        const testId = `${testPrefix}-${f.key}`
        const locked = disabled || (!!f.fixedAfterCreate && !creating)
        const need = needOf(f)
        const error = errors[f.key] ? `${f.label.split(' (')[0]} ${errors[f.key]}` : null
        if (f.kind === 'textarea') {
          return (
            <TextArea
              key={f.key}
              label={f.label}
              need={need}
              error={error}
              hint={f.hint}
              max={f.max}
              rows={3}
              value={String(value[f.key] ?? '')}
              disabled={locked}
              onChange={(e) => set(f.key, e.target.value)}
              data-testid={testId}
            />
          )
        }
        if (f.kind === 'list') {
          return (
            <ListTextField
              key={f.key}
              label={f.label}
              need={need}
              error={error}
              hint={f.hint ?? 'Separate entries with commas.'}
              value={value[f.key]}
              disabled={locked}
              onChange={(v) => set(f.key, v)}
              testId={testId}
            />
          )
        }
        if (f.kind === 'select') {
          return (
            <SelectInput
              key={f.key}
              label={f.label}
              need={f.required ? 'required' : undefined}
              error={error}
              value={value[f.key] == null ? '' : String(value[f.key])}
              options={f.options ?? []}
              disabled={locked}
              onChange={(v) => set(f.key, v === '' ? null : v)}
              testId={testId}
            />
          )
        }
        if (f.kind === 'checkbox') {
          return (
            <CheckboxInput
              key={f.key}
              label={f.label}
              checked={value[f.key] === true}
              disabled={locked}
              onChange={(v) => set(f.key, v)}
              testId={testId}
            />
          )
        }
        if (f.kind === 'number') {
          return (
            <TextField
              key={f.key}
              label={f.label}
              need={need}
              error={error}
              hint={f.hint}
              inputMode="numeric"
              value={value[f.key] == null ? '' : String(value[f.key])}
              disabled={locked}
              onChange={(e) => {
                const raw = e.target.value.trim()
                set(f.key, raw === '' ? null : Number.isFinite(Number(raw)) ? Number(raw) : raw)
              }}
              data-testid={testId}
            />
          )
        }
        return (
          <TextField
            key={f.key}
            label={f.label}
            need={need}
            error={error}
            hint={f.hint}
            maxLength={f.max}
            value={String(value[f.key] ?? '')}
            disabled={locked}
            onChange={(e) => set(f.key, e.target.value)}
            data-testid={testId}
          />
        )
  }
  const basic = fields.filter((f) => !f.advanced)
  const advanced = fields.filter((f) => f.advanced)
  const advancedError = advanced.some((f) => errors[f.key])
  return (
    <div className="admin-record">
      {basic.map(render)}
      {advanced.length ? (
        <details className="admin-details admin-record__advanced" open={advancedError || undefined} data-testid={`${testPrefix}-advanced`}>
          <summary>{adminCopy.fields.advanced}</summary>
          <div className="admin-record">{advanced.map(render)}</div>
        </details>
      ) : null}
    </div>
  )
}

/** A list of short strings edited as comma-separated text (keeps the typed text while editing). */
export function ListTextField({
  label,
  hint,
  need,
  error,
  value,
  onChange,
  disabled,
  testId,
}: {
  label: string
  hint?: string
  need?: FieldNeed
  error?: string | null
  value: unknown
  onChange: (v: string[]) => void
  disabled?: boolean
  testId: string
}) {
  // Keeps the typed text (commas, spaces) while editing; the parent re-keys it to reset.
  const [text, setText] = useState(() => listToText(value))
  return (
    <TextField
      label={label}
      hint={hint}
      need={need}
      error={error}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value)
        onChange(textToList(e.target.value))
      }}
      data-testid={testId}
    />
  )
}

export function SelectInput({
  label,
  value,
  options,
  onChange,
  disabled,
  testId,
  hint,
  need,
  error,
}: {
  label: string
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (v: string) => void
  disabled?: boolean
  testId: string
  hint?: string
  need?: FieldNeed
  error?: string | null
}) {
  const id = useId()
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
        <NeedMark need={need} />
      </label>
      {hint ? <p className="ui-field__hint">{hint}</p> : null}
      <select
        id={id}
        className="ui-input"
        value={value}
        aria-required={need === 'required' ? true : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="ui-field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function CheckboxInput({
  label,
  hint,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: ReactNode
  hint?: ReactNode
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  testId: string
}) {
  return (
    <label className="admin-check" data-testid={`${testId}-row`}>
      <input
        type="checkbox"
        className="admin-check__box"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
      <span className="admin-check__text">
        <span>{label}</span>
        {hint ? <span className="admin-muted">{hint}</span> : null}
      </span>
    </label>
  )
}

/** Locked floor entries (code-owned) plus editable additions, as chips. */
export function FloorList({
  label,
  hint,
  floor,
  additions,
  onChange,
  disabled,
  testId,
  lockedNote,
}: {
  label: string
  hint?: string
  floor: readonly string[]
  additions: readonly string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  testId: string
  lockedNote: string
}) {
  const [draft, setDraft] = useState('')
  const inputId = useId()
  const add = () => {
    const v = draft.trim()
    if (!v) return
    const seen = new Set([...floor, ...additions].map((x) => x.toLowerCase()))
    if (!seen.has(v.toLowerCase())) onChange([...additions, v])
    setDraft('')
  }
  return (
    <fieldset className="admin-floor" data-testid={testId}>
      <legend className="admin-floor__legend">{label}</legend>
      {hint ? <p className="admin-muted">{hint}</p> : null}
      <ul className="admin-chips" aria-label={`${label}: entries`}>
        {floor.map((x) => (
          <li key={`f-${x}`} className="admin-chip admin-chip--locked" data-testid={`${testId}-locked`}>
            {x}
            <span className="admin-sr-only"> ({lockedNote})</span>
          </li>
        ))}
        {additions.map((x, i) => (
          <li key={`a-${x}-${i}`} className="admin-chip">
            {x}
            {!disabled ? (
              <button
                type="button"
                className="admin-chip__remove"
                aria-label={`Remove ${x}`}
                onClick={() => onChange(additions.filter((_, j) => j !== i))}
                data-testid={`${testId}-remove`}
              >
                ×
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="admin-muted admin-floor__note">{lockedNote}</p>
      {!disabled ? (
        <div className="admin-floor__add">
          <TextField
            id={inputId}
            label="Add an entry"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            data-testid={`${testId}-input`}
          />
          <Button variant="secondary" onClick={add} data-testid={`${testId}-add`}>
            Add
          </Button>
        </div>
      ) : null}
    </fieldset>
  )
}

/** Full-width modal editor for one record, with a sticky Save/Cancel footer. The parent
 * re-keys it for every record it opens, so the fields start from `initial`. */
export function EditDialog({
  open,
  title,
  fields,
  initial,
  creating,
  saving,
  error,
  errors,
  onSave,
  onCancel,
  testId,
}: {
  open: boolean
  title: string
  fields: readonly FieldDef[]
  initial: Rec
  creating: boolean
  saving: boolean
  error?: string | null
  /** Plain-word problems for this record, keyed by field. */
  errors?: Record<string, string>
  onSave: (value: Rec) => void
  onCancel: () => void
  testId: string
}) {
  // A new record starts with every field present, so blank optional fields still save.
  const [value, setValue] = useState<Rec>(() => (creating ? blankRecord(fields, initial) : initial))
  const [keyEdited, setKeyEdited] = useState<Set<string>>(() => new Set())
  const onChange = (next: Rec) => {
    const out = { ...next }
    const edited = new Set(keyEdited)
    for (const f of fields) {
      if (!f.slugFrom) continue
      if (next[f.key] !== value[f.key]) edited.add(f.key)
      else if (creating && !edited.has(f.key) && next[f.slugFrom] !== value[f.slugFrom]) {
        out[f.key] = slugify(String(next[f.slugFrom] ?? ''))
      }
    }
    if (edited.size !== keyEdited.size) setKeyEdited(edited)
    setValue(out)
  }
  // Advanced fields (the key) last: they fill themselves from the name.
  const missing = missingRequired([...fields.filter((f) => !f.advanced), ...fields.filter((f) => f.advanced)], value)
  return (
    <ConfirmDialog
      open={open}
      title={title}
      confirmLabel={saving ? 'Saving…' : 'Save to draft'}
      cancelLabel="Cancel"
      busy={saving}
      confirmDisabled={missing.length > 0}
      onConfirm={() => onSave(value)}
      onCancel={onCancel}
      testId={testId}
    >
      <RecordFields fields={fields} value={value} onChange={onChange} testPrefix={testId} creating={creating} errors={errors} />
      {missing.length ? (
        <p className="admin-muted" data-testid={`${testId}-missing`}>
          {adminCopy.fields.fillIn(missing.join(', '))}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </ConfirmDialog>
  )
}
