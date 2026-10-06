import { useEffect, type ReactNode } from 'react'

export const APP_NAME = 'EPIC Voice Agent'

export interface PageLayoutProps {
  /** Page name; the document title becomes "<title> · EPIC Voice Agent". */
  title: string
  children: ReactNode
  'data-testid'?: string
}

export function PageLayout({ title, children, 'data-testid': testId }: PageLayoutProps) {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`
  }, [title])

  return (
    <div className="ui-layout">
      <header className="ui-layout__header">
        <div className="ui-layout__header-inner">{APP_NAME}</div>
      </header>
      <main className="ui-layout__main" data-testid={testId}>
        {children}
      </main>
    </div>
  )
}
