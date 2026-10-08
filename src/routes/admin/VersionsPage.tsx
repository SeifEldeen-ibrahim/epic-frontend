import { useState } from 'react'
import { Link } from 'react-router'
import { useConfigState, useDraftDiff, useVersions, type VersionItem } from '../../api/config'
import { ChangeList } from '../../admin/ChangeList'
import { LiveStatus } from '../../admin/ChangesBar'
import { summarize, useToolNames, versionHeading } from '../../admin/changeLabels'
import { AdminPage } from '../../admin/DataTable'
import { adminCopy } from '../../admin/copy'
import { EmptyState, ErrorState, StatusBadge } from '../../ui'

const c = adminCopy.versions

function VersionCard({ item, all }: { item: VersionItem; all: readonly VersionItem[] }) {
  const isFirst = item.source === 'seed' || item === all[all.length - 1]
  return (
    <li className="admin-panel admin-version" data-testid={`version-card-${item.seq}`}>
      <div className="admin-version__head">
        <Link className="admin-version__link" to={`/admin/versions/${item.seq}`}>
          {versionHeading(item, all)}
        </Link>
        {item.active ? (
          <span data-testid="version-live">
            <StatusBadge tone="ok">{c.live}</StatusBadge>
          </span>
        ) : null}
      </div>
      {item.source === 'rollback' && item.created_by ? <p className="admin-muted">{c.by(item.created_by)}</p> : null}
      {item.note ? (
        <p className="admin-version__note">
          <span className="admin-muted">{c.noteLabel} </span>
          {item.note}
        </p>
      ) : null}
      <p className="admin-version__summary" data-testid={`version-summary-${item.seq}`}>
        {isFirst ? c.firstSummary : summarize(item.summary)}
      </p>
    </li>
  )
}

/** "Changes not live yet": the saved changes callers don't hear yet, opened on demand. */
function PendingCard() {
  const [open, setOpen] = useState(false)
  const q = useDraftDiff(open)
  const tools = useToolNames()
  let body = null
  if (open) {
    if (q.isPending) {
      body = (
        <div aria-busy="true" data-testid="pending-loading">
          <span className="admin-sr-only">{c.pendingLoading}</span>
          <span className="admin-skeleton" />
        </div>
      )
    } else if (!q.data) body = <ErrorState message={c.pendingError} onRetry={() => void q.refetch()} data-testid="pending-error" />
    else if (q.data.changes.length === 0) body = <p data-testid="pending-empty">{c.pendingEmpty}</p>
    else body = <ChangeList changes={q.data.changes} names={q.data.names} tools={tools} headingLevel={3} testId="pending-changes" />
  }
  return (
    <section className="admin-panel admin-section" data-testid="versions-pending">
      <h2>{c.pendingTitle}</h2>
      <p>{c.pendingBody}</p>
      <details className="admin-details admin-disclosure" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} data-testid="pending-toggle">
        <summary>{c.pendingShow}</summary>
        {body}
      </details>
    </section>
  )
}

/** /admin/versions ("History"): every time changes went live, newest first (never deleted), as
 * plain cards with who, when, the note and what changed. */
export function VersionsPage() {
  const q = useVersions()
  const state = useConfigState()
  let body
  if (q.isPending) {
    body = (
      <div className="admin-panel admin-section" aria-busy="true" data-testid="versions-loading">
        <span className="admin-sr-only">{adminCopy.loading}</span>
        <span className="admin-skeleton" />
        <span className="admin-skeleton" />
      </div>
    )
  } else if (!q.data) body = <ErrorState message={c.error} onRetry={() => void q.refetch()} data-testid="versions-error" />
  else if (q.data.versions.length === 0) body = <EmptyState title={c.empty} data-testid="versions-empty" />
  else {
    const all = q.data.versions
    body = (
      <ol className="admin-versions" aria-label={c.listLabel} data-testid="versions-list">
        {all.map((item) => (
          <VersionCard key={item.seq} item={item} all={all} />
        ))}
      </ol>
    )
  }
  return (
    <AdminPage page="versions">
      {state.data ? <LiveStatus state={state.data} /> : null}
      {state.data && state.data.draft_changed_sections.length > 0 ? <PendingCard /> : null}
      {body}
    </AdminPage>
  )
}
