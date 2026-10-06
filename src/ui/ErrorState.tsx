import type { ReactNode } from 'react'
import { Button } from './Button'

export interface ErrorStateProps {
  message: ReactNode
  onRetry?: () => void
  retryLabel?: string
  'data-testid'?: string
}

export function ErrorState({ message, onRetry, retryLabel = 'Retry', 'data-testid': testId }: ErrorStateProps) {
  return (
    <div className="ui-state" role="alert" data-testid={testId}>
      <div>{message}</div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}
