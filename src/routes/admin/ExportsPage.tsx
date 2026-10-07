import { useState } from 'react'
import { useExport, useExportsPending, type ExportPendingResponse } from '../../api/admin'
import { AdminPage, CellLink, DataTable, ResultNotice, type Column } from '../../admin/DataTable'
import { adminCopy as c, formatTime, label, orDash } from '../../admin/copy'
import { Button, EmptyState, ErrorState } from '../../ui'

type Item = ExportPendingResponse['items'][number]

const columns: Column<Item>[] = [
  { key: 'decided', header: c.cols.decided, cell: (r) => formatTime(r.decided_at) },
  { key: 'submitted', header: c.cols.submitted, cell: (r) => formatTime(r.submitted_at) },
  { key: 'category', header: c.cols.category, cell: (r) => label(r.inquiry_category) },
  { key: 'language', header: c.cols.language, cell: (r) => orDash(r.language) },
  { key: 'relationship', header: c.cols.relationship, cell: (r) => label(r.caller_relationship) },
  {
    key: 'call',
    header: c.cols.call,
    link: true,
    cell: (r) => <CellLink to={`/admin/calls/${r.call_id}`}>{c.openCall}</CellLink>,
  },
]

/** 2026-10-07T12:00:00.000Z → 20261007T120000Z */
function stamp(iso: string): string {
  const d = new Date(iso)
  const safe = Number.isNaN(d.getTime()) ? new Date() : d
  return safe.toISOString().replace(/\.\d+Z$/, 'Z').replace(/[-:]/g, '')
}

function save(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

type Result = { ok: boolean; count: number; n: number }

export function ExportsPage() {
  const q = useExportsPending()
  const run = useExport()
  const [result, setResult] = useState<Result | null>(null)
  const empty = !q.data || q.data.items.length === 0

  const onExport = () =>
    run.mutate(undefined, {
      onSuccess: (r) => {
        const base = `clinic-export-${stamp(r.exported_at)}`
        save(`${base}.csv`, 'text/csv', r.csv)
        save(`${base}.json`, 'application/json', JSON.stringify(r.rows, null, 2))
        setResult((p) => ({ ok: true, count: r.count, n: (p?.n ?? 0) + 1 }))
      },
      onError: () => setResult((p) => ({ ok: false, count: 0, n: (p?.n ?? 0) + 1 })),
    })

  let body
  if (q.isPending) body = <DataTable name="exports" caption={c.exports.caption} columns={columns} loading />
  else if (!q.data)
    body = <ErrorState message={c.exports.error} onRetry={() => void q.refetch()} data-testid="exports-error" />
  else if (q.data.items.length === 0) body = <EmptyState title={c.exports.empty} data-testid="exports-empty" />
  else
    body = (
      <DataTable name="exports" caption={c.exports.caption} columns={columns} rows={q.data.items} rowKey={(r) => r.form_id} />
    )

  return (
    <AdminPage
      page="exports"
      actions={
        <Button onClick={onExport} disabled={empty || run.isPending} data-testid="exports-run">
          {run.isPending ? c.exports.running : c.exports.run}
        </Button>
      }
    >
      {result ? (
        <ResultNotice testId="exports-result" focusKey={result.n} tone={result.ok ? 'info' : 'warning'}>
          {result.ok ? c.exports.result(result.count) : c.exports.failed}
        </ResultNotice>
      ) : null}
      {body}
    </AdminPage>
  )
}
