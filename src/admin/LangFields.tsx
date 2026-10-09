import { useId, useState } from 'react'
import { Button, TextField } from '../ui'

export type LangDir = 'ltr' | 'rtl'

/** Lock note for code-owned lines and phrases. */
export const SET_BY_US = "Set by us (can't change)"

/** One language's text for one line. The label, help, English reference and error stay in
 * English, left-to-right; only the input carries the language's `lang`/`dir`. */
export function LangTextField({
  code,
  dir,
  lineKey,
  label,
  help,
  english,
  value,
  onChange,
  error,
  disabled,
  placeholder,
}: {
  code: string
  dir: LangDir
  lineKey: string
  label: string
  /** Plain "when it is used" help. */
  help?: string
  /** The English text, shown muted underneath as "In English: …". */
  english?: string
  value: string
  onChange: (next: string) => void
  error?: string | null
  disabled?: boolean
  placeholder?: string
}) {
  const id = `lang-${code}-${lineKey}`
  const englishId = `${id}-en`
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const describedBy =
    [english ? englishId : null, help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className="ui-field" lang="en" dir="ltr">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="ui-input"
        lang={code}
        dir={dir}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        data-testid={id}
      />
      {english ? (
        <p className="ui-field__hint admin-muted" id={englishId} lang="en" dir="ltr">
          In English: {english}
        </p>
      ) : null}
      {help ? (
        <p className="ui-field__hint" id={helpId}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field__error" id={errorId} lang="en" dir="ltr">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Crisis phrases for one language: locked floor chips plus removable additions. */
export function LangPhraseList({
  code,
  dir,
  languageName,
  label,
  hint,
  floor,
  additions,
  onChange,
  enabled,
  disabled,
  testId,
}: {
  code: string
  dir: LangDir
  languageName: string
  label: string
  hint?: string
  floor: readonly string[]
  additions: readonly string[]
  onChange: (next: string[]) => void
  /** The language is switched on for calls. When off, the phrases are kept but not used. */
  enabled: boolean
  disabled?: boolean
  testId: string
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
    <fieldset className="admin-floor" data-testid={testId} lang="en" dir="ltr">
      <legend className="admin-floor__legend">{label}</legend>
      {hint ? <p className="admin-muted">{hint}</p> : null}
      {!enabled ? (
        <p className="admin-muted" data-testid={`${testId}-kept`}>
          {languageName} is off. These are kept, not used on calls.
        </p>
      ) : null}
      <ul className="admin-chips" aria-label={`${label}: entries`}>
        {floor.map((x) => (
          <li key={`f-${x}`} className="admin-chip admin-chip--locked" data-testid={`${testId}-locked`}>
            <span lang={code} dir={dir}>
              {x}
            </span>
            <span className="admin-sr-only"> ({SET_BY_US})</span>
          </li>
        ))}
        {additions.map((x, i) => (
          <li key={`a-${x}-${i}`} className="admin-chip">
            <span lang={code} dir={dir}>
              {x}
            </span>
            {!disabled ? (
              <button
                type="button"
                className="admin-chip__remove"
                aria-label={`Remove '${x}'`}
                onClick={() => onChange(additions.filter((_, j) => j !== i))}
                data-testid={`${testId}-remove`}
              >
                ×
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {floor.length > 0 ? <p className="admin-muted admin-floor__note">{SET_BY_US}</p> : null}
      {!disabled ? (
        <div className="admin-floor__add">
          <TextField
            id={inputId}
            label="Add a phrase"
            lang={code}
            dir={dir}
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
