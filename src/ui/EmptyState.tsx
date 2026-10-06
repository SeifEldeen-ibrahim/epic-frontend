import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  children?: ReactNode
}

export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <div className="ui-state">
      <strong>{title}</strong>
      {children ? <div className="ui-state__muted">{children}</div> : null}
    </div>
  )
}
