import { useConfigState, useVersions, type VersionItem } from '../../api/config'
import { LiveStatus } from '../../admin/ChangesBar'
import { AdminPage, CellLink, DataTable, type Column } from '../../admin/DataTable'
import { adminCopy, formatTime, orDash } from '../../admin/copy'
import { EmptyState, ErrorState, StatusBadge } from '../../ui'

const c = adminCopy.versions

/** /admin/versions ("History"): every time changes went live, newest first (never deleted), and
 * what is live now. */
export function VersionsPage() {
  const q = useVersions()
  const state = useConfigState()
  const columns: Column<VersionItem>[] = [
    {
      key: 'seq',
      header: c.seq,
      link: true,
      cell: (v) => (
        <CellLink to={`/admin/versions/${v.seq}`} label={`${c.seq} ${v.seq}`}>
          {v.seq}
        </CellLink>
      ),
    },
    { key: 'label', header: c.label, cell: (v) => <code className="admin-small">{v.label}</code> },
    {
      key: 'source',
      header: c.source,
      cell: (v) => (
        <span className="admin-cell-stack">
          <span>{c.sources[v.source] ?? v.source}</span>
          {v.rolled_back_from ? <span className="admin-muted">← {v.rolled_back_from}</span> : null}
        </span>
      ),
    },
    { key: 'by', header: c.by, cell: (v) => orDash(v.created_by) },
    { key: 'when', header: c.when, cell: (v) => formatTime(v.created_at) },
    { key: 'note', header: c.note, cell: (v) => orDash(v.note) },
    { key: 'live', header: c.live, cell: (v) => (v.active ? <StatusBadge tone="ok">{c.live}</StatusBadge> : null) },
  ]
  let body
  if (q.isPending) body = <DataTable name="versions" caption={adminCopy.pages.versions} columns={columns} loading />
  else if (!q.data) body = <ErrorState message={c.error} onRetry={() => void q.refetch()} data-testid="versions-error" />
  else if (q.data.versions.length === 0) body = <EmptyState title={c.empty} data-testid="versions-empty" />
  else body = <DataTable name="versions" caption={adminCopy.pages.versions} columns={columns} rows={q.data.versions} rowKey={(v) => String(v.seq)} />
  return (
    <AdminPage page="versions">
      {state.data ? <LiveStatus state={state.data} /> : null}
      {body}
    </AdminPage>
  )
}
