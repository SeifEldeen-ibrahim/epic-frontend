import { useState } from 'react'
import { AdminApiError, useAcknowledgeFollowUp, useFollowUp, type FollowUpItem } from '../../api/admin'
import { AdminPage, CellLink, DataTable, ResultNotice, type Column } from '../../admin/DataTable'
import { adminCopy as c, formStatusTone, formatTime, label, orDash, outcomeTone } from '../../admin/copy'
import { Button, EmptyState, ErrorState, StatusBadge } from '../../ui'

type Result = { kind: 'done' | 'conflict' | 'failed'; n: number }

export function FollowUpPage() {
  const q = useFollowUp()
  const ack = useAcknowledgeFollowUp()
  const [result, setResult] = useState<Result | null>(null)
  const show = (kind: Result['kind']) => setResult((r) => ({ kind, n: (r?.n ?? 0) + 1 }))

  const acknowledge = (callId: string) =>
    ack.mutate(callId, {
      onSuccess: () => show('done'),
      onError: (e) => {
        if (e instanceof AdminApiError && e.isConflict) {
          show('conflict')
          void q.refetch()
        } else show('failed')
      },
    })

  const columns: Column<FollowUpItem>[] = [
    {
      key: 'reason',
      header: c.cols.reason,
      cell: (r) => (
        <span className="admin-cell-stack">
          {r.outcome ? <StatusBadge tone={outcomeTone(r.outcome)}>{label(r.outcome)}</StatusBadge> : null}
          {r.form_status ? (
            <StatusBadge tone={formStatusTone(r.form_status)}>{`${c.followUp.form}: ${label(r.form_status)}`}</StatusBadge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'caller',
      header: c.cols.caller,
      cell: (r) =>
        r.stated_name || r.stated_reason ? (
          <span className="admin-cell-stack">
            {r.stated_name ? <strong>{r.stated_name}</strong> : null}
            {r.stated_reason ? <span className="admin-muted">{r.stated_reason}</span> : null}
          </span>
        ) : (
          c.dash
        ),
    },
    { key: 'language', header: c.cols.language, cell: (r) => orDash(r.language) },
    { key: 'ended', header: c.cols.ended, cell: (r) => formatTime(r.ended_at ?? r.started_at) },
    {
      key: 'call',
      header: c.cols.call,
      link: true,
      cell: (r) => <CellLink to={`/admin/calls/${r.call_id}`}>{c.openCall}</CellLink>,
    },
    {
      key: 'action',
      header: c.cols.action,
      cell: (r) => {
        const busy = ack.isPending && ack.variables === r.call_id
        return (
          <Button
            variant="secondary"
            onClick={() => acknowledge(r.call_id)}
            disabled={busy}
            aria-label={`${c.followUp.acknowledge} ${r.stated_name ?? formatTime(r.ended_at ?? r.started_at)}`}
            data-testid="follow-up-ack"
          >
            {busy ? c.followUp.acknowledging : c.followUp.acknowledge}
          </Button>
        )
      },
    },
  ]

  let body
  if (q.isPending) body = <DataTable name="follow-up" caption={c.followUp.caption} columns={columns} loading />
  else if (!q.data)
    body = <ErrorState message={c.followUp.error} onRetry={() => void q.refetch()} data-testid="follow-up-error" />
  else if (q.data.items.length === 0) body = <EmptyState title={c.followUp.empty} data-testid="follow-up-empty" />
  else
    body = (
      <DataTable
        name="follow-up"
        caption={c.followUp.caption}
        columns={columns}
        rows={q.data.items}
        rowKey={(r) => r.call_id}
      />
    )

  return (
    <AdminPage page="follow-up">
      {result ? (
        <ResultNotice testId="follow-up-result" focusKey={result.n} tone={result.kind === 'done' ? 'info' : 'warning'}>
          {result.kind === 'done' ? c.followUp.done : result.kind === 'conflict' ? c.followUp.conflict : c.followUp.failed}
        </ResultNotice>
      ) : null}
      {body}
    </AdminPage>
  )
}
