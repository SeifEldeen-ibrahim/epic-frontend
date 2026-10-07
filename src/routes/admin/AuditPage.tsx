import { useState } from 'react'
import { useAuditLog, type AuditListResponse, type AuditParams } from '../../api/admin'
import { AdminPage, DataTable, Pager, SelectField, type Column } from '../../admin/DataTable'
import { adminCopy as c, formatTime, label, orDash } from '../../admin/copy'
import { EmptyState, ErrorState } from '../../ui'

type Item = AuditListResponse['items'][number]
type Action = Item['action']

const ACTIONS: Action[] = [
  'login',
  'login_failed',
  'logout',
  'change_password',
  'view_call',
  'play_recording',
  'edit_field',
  'approve',
  'reject',
  'export',
  'resolve_flag',
  'acknowledge_follow_up',
  'user_admin',
  'soft_delete',
  'restore',
]

const columns: Column<Item>[] = [
  { key: 'time', header: c.cols.time, cell: (r) => formatTime(r.at) },
  { key: 'actor', header: c.cols.actor, cell: (r) => label(r.actor) },
  { key: 'email', header: c.cols.staffEmail, cell: (r) => orDash(r.staff_email) },
  { key: 'action', header: c.cols.action, cell: (r) => label(r.action) },
  { key: 'target', header: c.cols.target, cell: (r) => orDash(r.target) },
]

export function AuditPage() {
  const [action, setAction] = useState<Action | ''>('')
  const [stack, setStack] = useState<string[]>([])
  const params: AuditParams = {
    action: action || undefined,
    before: stack.length ? stack[stack.length - 1] : undefined,
  }
  const q = useAuditLog(params)

  let body
  if (q.isPending) body = <DataTable name="audit" caption={c.audit.caption} columns={columns} loading />
  else if (!q.data) body = <ErrorState message={c.audit.error} onRetry={() => void q.refetch()} data-testid="audit-error" />
  else if (q.data.items.length === 0)
    body = <EmptyState title={action ? c.audit.filteredEmpty : c.audit.empty} data-testid="audit-empty" />
  else
    body = <DataTable name="audit" caption={c.audit.caption} columns={columns} rows={q.data.items} rowKey={(r) => String(r.id)} />

  const next = q.data?.next_cursor ?? null
  return (
    <AdminPage page="audit">
      <div className="admin-filters">
        <SelectField
          label={c.audit.filter}
          value={action}
          onChange={(v) => {
            setAction(ACTIONS.find((a) => a === v) ?? '')
            setStack([])
          }}
          options={[{ value: '', label: c.audit.all }, ...ACTIONS.map((a) => ({ value: a, label: label(a) }))]}
          testId="audit-filter-action"
        />
      </div>
      {body}
      <Pager
        name="audit"
        hasPrevious={stack.length > 0}
        hasNext={next !== null}
        onPrevious={() => setStack(stack.slice(0, -1))}
        onNext={() => next && setStack([...stack, next])}
      />
    </AdminPage>
  )
}
