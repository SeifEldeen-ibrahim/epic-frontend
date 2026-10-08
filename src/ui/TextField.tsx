import { useId, type InputHTMLAttributes } from 'react'

export type FieldNeed = 'required' | 'optional'

/** The label suffix for a required or optional field. */
export function NeedMark({ need }: { need?: FieldNeed }) {
  if (need === 'required') {
    return (
      <span className="ui-field__need" data-need="required">
        {' '}
        <span aria-hidden="true">*</span>
        <span className="sr-only">Required</span>
      </span>
    )
  }
  if (need === 'optional') {
    return (
      <span className="ui-field__need ui-field__need--optional" data-need="optional">
        {' '}
        (optional)
      </span>
    )
  }
  return null
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'aria-describedby' | 'aria-invalid'> {
  label: string
  /** Inline validation or server error; marks the input invalid and describes it. */
  error?: string | null
  hint?: string
  /** Marks the label: `required` → "*" (read as "Required"), `optional` → "(optional)". */
  need?: FieldNeed
  /** Applied to the input element itself. */
  'data-testid'?: string
}

export function TextField({ label, error, hint, need, id, className, 'data-testid': testId, ...rest }: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={['ui-field', className].filter(Boolean).join(' ')}>
      <label className="ui-field__label" htmlFor={inputId}>
        {label}
        <NeedMark need={need} />
      </label>
      {hint ? (
        <p className="ui-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      <input
        {...rest}
        id={inputId}
        className="ui-input"
        aria-required={need === 'required' ? true : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        data-testid={testId}
      />
      {error ? (
        <p className="ui-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
