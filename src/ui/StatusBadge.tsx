export type StatusTone = 'ok' | 'error' | 'warning'

export interface StatusBadgeProps {
  tone: StatusTone
  children: string
}

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>
}
