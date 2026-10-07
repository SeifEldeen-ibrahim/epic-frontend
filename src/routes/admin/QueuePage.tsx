import { useQueue, type QueueResponse } from '../../api/admin'
import { AdminPage, CellLink, DataTable, type Column } from '../../admin/DataTable'
import { adminCopy as c, formatClock, formatTime, label, orDash } from '../../admin/copy'
import { Button, EmptyState, ErrorState, Notice, StatusBadge } from '../../ui'

type Item = QueueResponse['items'][number]

function flagText(f: Item['flag_counts']) {
  const parts = [f.open ? `${f.open} open` : '', f.carried ? `${f.carried} carried` : ''].filter(Boolean)
  return parts.length ? <StatusBadge tone="warning">{parts.join(', ')}</StatusBadge> : c.none
}

const columns: Column<Item>[] = [
  { key: 'submitted', header: c.cols.submitted, cell: (r) => formatTime(r.submitted_at) },
  {
    key: 'after',
    header: c.cols.afterHours,
    cell: (r) => (r.after_hours_queued ? <StatusBadge tone="warning">{c.queue.afterHours}</StatusBadge> : c.dash),
  },
  { key: 'language', header: c.cols.language, cell: (r) => orDash(r.language) },
  { key: 'category', header: c.cols.category, cell: (r) => label(r.inquiry_category) },
  { key: 'route', header: c.cols.route, cell: (r) => label(r.route_role) },
  { key: 'flags', header: c.cols.flags, cell: (r) => flagText(r.flag_counts) },
  {
    key: 'call',
    header: c.cols.call,
    link: true,
    cell: (r) => <CellLink to={`/admin/calls/${r.call_id}`}>{c.openCall}</CellLink>,
  },
]

export function QueuePage() {
  const q = useQueue()
  const refresh = () => void q.refetch()
  let body
  if (q.isPending) body = <DataTable name="queue" caption={c.queue.caption} columns={columns} loading />
  else if (!q.data) body = <ErrorState message={c.queue.error} onRetry={refresh} data-testid="queue-error" />
  else if (q.data.items.length === 0)
    body = (
      <EmptyState title={c.queue.empty} data-testid="queue-empty">
        {c.queue.emptyBody}
      </EmptyState>
    )
  else
    body = (
      <DataTable name="queue" caption={c.queue.caption} columns={columns} rows={q.data.items} rowKey={(r) => r.form_id} />
    )
  return (
    <AdminPage
      page="queue"
      actions={
        q.data ? (
          <Button variant="secondary" onClick={refresh} disabled={q.isFetching} data-testid="queue-refresh">
            {c.queue.refresh}
          </Button>
        ) : null
      }
    >
      {q.isError && q.data ? (
        <div className="admin-stale" data-testid="queue-stale">
          <Notice>{c.queue.stale(formatClock(q.dataUpdatedAt))}</Notice>
          <Button variant="secondary" onClick={refresh} disabled={q.isFetching}>
            {c.retry}
          </Button>
        </div>
      ) : null}
      {body}
    </AdminPage>
  )
}
