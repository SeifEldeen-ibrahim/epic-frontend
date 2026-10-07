import { useId, useState, type ReactNode } from 'react'
import { Button, TextArea, TextField } from '../ui'
import { ConfirmDialog } from './ConfirmDialog'

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
}: {
  fields: readonly FieldDef[]
  value: Rec
  onChange: (next: Rec) => void
  testPrefix: string
  creating?: boolean
  disabled?: boolean
}) {
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v })
  return (
    <div className="admin-record">
      {fields.map((f) => {
        const testId = `${testPrefix}-${f.key}`
        const locked = disabled || (!!f.fixedAfterCreate && !creating)
        if (f.kind === 'textarea') {
          return (
            <TextArea
              key={f.key}
              label={f.label}
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
            hint={f.hint}
            maxLength={f.max}
            value={String(value[f.key] ?? '')}
            disabled={locked}
            onChange={(e) => set(f.key, e.target.value)}
            data-testid={testId}
          />
        )
      })}
    </div>
  )
}

/** A list of short strings edited as comma-separated text (keeps the typed text while editing). */
export function ListTextField({
  label,
  hint,
  value,
  onChange,
  disabled,
  testId,
}: {
  label: string
  hint?: string
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
}: {
  label: string
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (v: string) => void
  disabled?: boolean
  testId: string
  hint?: string
}) {
  const id = useId()
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      {hint ? <p className="ui-field__hint">{hint}</p> : null}
      <select
        id={id}
        className="ui-input"
        value={value}
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
  onSave: (value: Rec) => void
  onCancel: () => void
  testId: string
}) {
  const [value, setValue] = useState<Rec>(initial)
  return (
    <ConfirmDialog
      open={open}
      title={title}
      confirmLabel={saving ? 'Saving…' : 'Save to draft'}
      cancelLabel="Cancel"
      busy={saving}
      onConfirm={() => onSave(value)}
      onCancel={onCancel}
      testId={testId}
    >
      <RecordFields fields={fields} value={value} onChange={setValue} testPrefix={testId} creating={creating} />
      {error ? (
        <p className="ui-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </ConfirmDialog>
  )
}
