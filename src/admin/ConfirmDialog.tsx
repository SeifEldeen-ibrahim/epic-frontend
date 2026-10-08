import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from '../ui'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  cancelLabel: string
  busy?: boolean
  /** Keeps the confirm button off (e.g. required fields still empty). */
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
  testId: string
}

/** Native modal <dialog> (focus trap, Escape) with a sticky action footer. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  testId,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    }
    if (!open && d.open) {
      if (typeof d.close === 'function') d.close()
      else d.removeAttribute('open')
    }
  }, [open])
  return (
    <dialog
      ref={ref}
      className="admin-dialog"
      aria-labelledby={titleId}
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onCancel()
      }}
    >
      <div className="admin-dialog__body">
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
      <div className="admin-dialog__footer">
        <Button variant="secondary" onClick={onCancel} disabled={busy} data-testid={`${testId}-cancel`}>
          {cancelLabel}
        </Button>
        <Button onClick={onConfirm} disabled={busy || confirmDisabled} data-testid={`${testId}-confirm`}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
