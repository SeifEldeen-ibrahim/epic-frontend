import type { ReactNode } from 'react'

export interface NoticeProps {
  tone?: 'warning' | 'info'
  children: ReactNode
}

export function Notice({ tone = 'warning', children }: NoticeProps) {
  return (
    <div className={`ui-notice ui-notice--${tone}`} role="note">
      {children}
    </div>
  )
}
