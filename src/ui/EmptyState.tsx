import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  children?: ReactNode
  'data-testid'?: string
}

export function EmptyState({ title, children, 'data-testid': testId }: EmptyStateProps) {
  return (
    <div className="ui-state" data-testid={testId}>
      <strong>{title}</strong>
      {children ? <div className="ui-state__muted">{children}</div> : null}
    </div>
  )
}
