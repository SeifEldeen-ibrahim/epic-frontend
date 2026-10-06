import type { HealthResponse } from '../../api/health'
import { ErrorState, Spinner, StatusBadge } from '../../ui'

export interface StatusCardProps {
  isLoading: boolean
  /** Set when the health request itself failed (network or unexpected status). */
  error: Error | null
  data: HealthResponse | undefined
  onRetry: () => void
}

function partLabel(name: string, value: 'ok' | 'error') {
  return (
    <li key={name}>
      <span>{name}</span>
      <StatusBadge tone={value === 'ok' ? 'ok' : 'error'}>{value}</StatusBadge>
    </li>
  )
}

/** Presentational system-status card; the page owns the health query. */
export function StatusCard({ isLoading, error, data, onRetry }: StatusCardProps) {
  let body
  if (isLoading) {
    body = (
      <div className="ui-state" data-testid="status-loading">
        <Spinner label="Checking system status" />
        <span className="ui-state__muted">Checking system status…</span>
      </div>
    )
  } else if (error || !data) {
    body = (
      <ErrorState
        data-testid="status-error"
        onRetry={onRetry}
        message={<p>Could not reach the server. The status check itself failed.</p>}
      />
    )
  } else if (data.status !== 'ok') {
    const failed = [data.db === 'error' && 'database', data.storage === 'error' && 'storage'].filter(Boolean)
    body = (
      <ErrorState
        data-testid="status-error"
        onRetry={onRetry}
        message={
          <>
            <p>Not working: {failed.length ? failed.join(' and ') : 'unknown part'}.</p>
            <ul className="ui-status-list">
              {partLabel('Database', data.db)}
              {partLabel('Storage', data.storage)}
            </ul>
          </>
        }
      />
    )
  } else {
    body = (
      <div data-testid="status-ok">
        <ul className="ui-status-list">
          {partLabel('Database', data.db)}
          {partLabel('Storage', data.storage)}
        </ul>
      </div>
    )
  }

  return (
    <section className="ui-card" aria-labelledby="status-card-title">
      <h2 id="status-card-title">System status</h2>
      <div className="ui-card__body">{body}</div>
    </section>
  )
}
