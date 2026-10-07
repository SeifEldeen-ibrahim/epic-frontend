import { Link } from 'react-router'
import { useHome, type HomeResponse } from '../../api/admin'
import { LoadExampleButton } from '../../admin/ChangesBar'
import { AdminPage } from '../../admin/DataTable'
import { adminCopy } from '../../admin/copy'
import { ErrorState, StatusBadge } from '../../ui'

const c = adminCopy.home

function Stat({ label, value, to, linkLabel, testId }: { label: string; value: number; to: string; linkLabel: string; testId: string }) {
  return (
    <div className="admin-panel admin-stat" data-testid={testId}>
      <span className="admin-stat__label">{label}</span>
      <strong className="admin-stat__value">{value}</strong>
      <Link className="ui-link" to={to}>
        {linkLabel}
      </Link>
    </div>
  )
}

function Checklist({ home }: { home: HomeResponse }) {
  const setup = home.setup as unknown as Record<string, boolean>
  return (
    <section className="admin-panel admin-section" aria-labelledby="home-checklist" data-testid="home-checklist">
      <h2 id="home-checklist">{c.checklist}</h2>
      <p className="admin-muted">{c.checklistHint}</p>
      <ol className="admin-steps">
        {c.steps.map((step, i) => {
          const done = Boolean(setup[step.key])
          const inner = (
            <>
              <span className="admin-steps__num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="admin-steps__text">
                <span className="admin-steps__title">{step.title}</span>
                <span className="admin-muted">{step.body}</span>
              </span>
              <span className="admin-steps__status">
                {step.optional ? <StatusBadge tone="warning">{c.optional}</StatusBadge> : null}
                <StatusBadge tone={done ? 'ok' : 'warning'}>{done ? c.done : c.todo}</StatusBadge>
              </span>
            </>
          )
          return (
            <li key={step.key} className={`admin-steps__item${done ? ' admin-steps__item--done' : ''}`} data-testid={`home-step-${step.key}`} data-done={done}>
              {step.to.startsWith('/admin') ? (
                <Link className="admin-steps__link" to={step.to}>
                  {inner}
                </Link>
              ) : (
                <a className="admin-steps__link" href={step.to}>
                  {inner}
                </a>
              )}
            </li>
          )
        })}
      </ol>
      {home.can_edit && !home.setup.live ? (
        <div className="admin-section admin-actions">
          <p className="admin-muted">{c.exampleHint}</p>
          <LoadExampleButton />
        </div>
      ) : null}
    </section>
  )
}

/** /admin: what is happening today, whether the line takes calls, and what to set up next. */
export function HomePage() {
  const q = useHome()
  let body
  if (q.isPending) {
    body = (
      <div className="admin-stats" aria-busy="true" data-testid="home-loading">
        <span className="admin-sr-only">{adminCopy.loading}</span>
        <div className="admin-panel admin-stat">
          <span className="admin-skeleton" />
        </div>
        <div className="admin-panel admin-stat">
          <span className="admin-skeleton" />
        </div>
      </div>
    )
  } else if (!q.data) {
    body = <ErrorState message={c.error} onRetry={() => void q.refetch()} data-testid="home-error" />
  } else {
    const home = q.data
    const complete = home.setup.live && home.setup.test_call
    body = (
      <>
        <p className={`admin-linestate admin-linestate--${home.line_live ? 'live' : 'off'}`} role="status" data-testid="home-line">
          <StatusBadge tone={home.line_live ? 'ok' : 'warning'}>{home.line_live ? c.liveBadge : c.offBadge}</StatusBadge>{' '}
          {home.line_live ? c.live(home.answering_agent ?? adminCopy.dash) : c.notLive}
        </p>
        <div className="admin-stats">
          <Stat label={c.callsToday} value={home.calls_today} to="/admin/calls" linkLabel={c.openCalls} testId="home-calls-today" />
          <Stat label={c.formsWaiting} value={home.forms_waiting} to="/admin/queue" linkLabel={c.openQueue} testId="home-forms-waiting" />
        </div>
        {complete ? null : <Checklist home={home} />}
      </>
    )
  }
  return <AdminPage page="home">{body}</AdminPage>
}
