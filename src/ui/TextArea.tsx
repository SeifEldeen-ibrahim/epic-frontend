import { useId, type TextareaHTMLAttributes } from 'react'
import { NeedMark, type FieldNeed } from './TextField'

export interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'aria-describedby' | 'aria-invalid'> {
  label: string
  error?: string | null
  hint?: string
  need?: FieldNeed
  /** Shows "n / max" under the field when set (and caps the input). */
  max?: number
  'data-testid'?: string
}

/** Multi-line text field with label, hint, error and an optional character counter. */
export function TextArea({ label, error, hint, need, max, id, className, value, 'data-testid': testId, ...rest }: TextAreaProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const countId = `${inputId}-count`
  const length = typeof value === 'string' ? value.length : 0
  const describedBy =
    [hint ? hintId : null, error ? errorId : null, max ? countId : null].filter(Boolean).join(' ') || undefined
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
      <textarea
        {...rest}
        id={inputId}
        value={value}
        maxLength={max}
        className="ui-input ui-textarea"
        aria-required={need === 'required' ? true : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        data-testid={testId}
      />
      {max ? (
        <p className="ui-field__hint ui-textarea__count" id={countId}>
          {length} / {max}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
