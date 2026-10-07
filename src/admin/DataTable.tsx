import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { APP_NAME, Button, Notice } from '../ui'
import { adminCopy, type AdminPageKey } from './copy'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  /** The cell holds a CellLink that fills the whole cell. */
  link?: boolean
}

export interface DataTableProps<T> {
  /** data-testid is `admin-table-<name>`, or `<name>-loading` in skeleton mode. */
  name: string
  caption: string
  columns: Column<T>[]
  rows?: readonly T[]
  rowKey?: (row: T) => string
  loading?: boolean
  skeletonRows?: number
}

/** Presentational table inside its own horizontal scroller; skeleton rows keep the real row height. */
export function DataTable<T>({
  name,
  caption,
  columns,
  rows = [],
  rowKey,
  loading = false,
  skeletonRows = 5,
}: DataTableProps<T>) {
  return (
    <div className="admin-table-scroll" data-testid="admin-table-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table
        className="admin-table"
        data-testid={loading ? `${name}-loading` : `admin-table-${name}`}
        aria-busy={loading || undefined}
      >
        <caption>
          {caption}
          {loading ? <span className="admin-sr-only"> {adminCopy.loading}</span> : null}
        </caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={i} className="admin-table__row">
                  {columns.map((c) => (
                    <td key={c.key}>
                      <span className="admin-skeleton" aria-hidden="true" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row, i) => (
                <tr key={rowKey ? rowKey(row) : i} className="admin-table__row">
                  {columns.map((c) => (
                    <td key={c.key} className={c.link ? 'admin-table__link-cell' : undefined}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  )
}

/** A link that fills its table cell (at least --target-min tall). */
export function CellLink({ to, children, label }: { to: string; children: ReactNode; label?: string }) {
  return (
    <Link className="admin-table__link" to={to} aria-label={label}>
      {children}
    </Link>
  )
}

/** Page frame: section + h1 (+ optional header actions) and the document title. */
export function AdminPage({ page, actions, children }: { page: AdminPageKey; actions?: ReactNode; children: ReactNode }) {
  const title = adminCopy.pages[page]
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`
  }, [title])
  return (
    <section className="admin-page" data-testid={`admin-${page}`}>
      <div className="admin-page__head">
        <h1>{title}</h1>
        {actions}
      </div>
      {children}
    </section>
  )
}

export interface SelectOption {
  value: string
  label: string
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly SelectOption[]
  testId?: string
}) {
  const id = useId()
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="ui-input" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Result message that takes focus whenever `focusKey` changes. */
export function ResultNotice({
  testId,
  focusKey,
  tone = 'info',
  children,
}: {
  testId: string
  focusKey: number
  tone?: 'info' | 'warning'
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [focusKey])
  return (
    <div ref={ref} tabIndex={-1} role="status" className="admin-result" data-testid={testId}>
      <Notice tone={tone}>{children}</Notice>
    </div>
  )
}

/** Previous / Next page buttons for cursor paging; hidden when there is only one page. */
export function Pager({
  name,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
}: {
  name: string
  hasPrevious: boolean
  hasNext: boolean
  onPrevious: () => void
  onNext: () => void
}) {
  if (!hasPrevious && !hasNext) return null
  return (
    <nav className="admin-actions" aria-label={`${name} pages`}>
      <Button variant="secondary" disabled={!hasPrevious} onClick={onPrevious} data-testid={`${name}-prev`}>
        {adminCopy.previous}
      </Button>
      <Button variant="secondary" disabled={!hasNext} onClick={onNext} data-testid={`${name}-next`}>
        {adminCopy.next}
      </Button>
    </nav>
  )
}
