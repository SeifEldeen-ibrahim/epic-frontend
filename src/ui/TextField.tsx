import { useId, type InputHTMLAttributes } from 'react'

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'aria-describedby' | 'aria-invalid'> {
  label: string
  /** Inline validation or server error; marks the input invalid and describes it. */
  error?: string | null
  hint?: string
  /** Applied to the input element itself. */
  'data-testid'?: string
}

export function TextField({ label, error, hint, id, className, 'data-testid': testId, ...rest }: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={['ui-field', className].filter(Boolean).join(' ')}>
      <label className="ui-field__label" htmlFor={inputId}>
        {label}
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
