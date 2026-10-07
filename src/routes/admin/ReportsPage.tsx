import { useState, type FormEvent } from 'react'
import { useReports, type ReportsParams, type ReportsResponse } from '../../api/admin'
import { AdminPage, DataTable, SelectField, type Column } from '../../admin/DataTable'
import { adminCopy as c, label, localDate } from '../../admin/copy'
import { Button, EmptyState, ErrorState, TextField } from '../../ui'

type Period = 'day' | 'week'
type Unmet = ReportsResponse['unmet_demand'][number]
type Outcome = ReportsResponse['outcomes'][number]
type Routing = ReportsResponse['routing_mix'][number]
type Latency = ReportsResponse['latency'][number]
type Delegation = ReportsResponse['delegation'][number]
type Gate = ReportsResponse['gate_results'][number]
type Unapproved = ReportsResponse['unapproved'][number]

const ms = (n: number) => String(Math.round(n))
const unmetCols: Column<Unmet>[] = [
  { key: 'period', header: c.cols.period, cell: (r) => r.period_start },
  { key: 'category', header: c.cols.category, cell: (r) => label(r.category) },
  { key: 'count', header: c.cols.count, cell: (r) => String(r.count) },
]
const outcomeCols: Column<Outcome>[] = [
  { key: 'category', header: c.cols.category, cell: (r) => label(r.inquiry_category) },
  { key: 'outcome', header: c.cols.outcome, cell: (r) => label(r.outcome) },
  { key: 'count', header: c.cols.count, cell: (r) => String(r.count) },
]
const routingCols: Column<Routing>[] = [
  { key: 'route', header: c.cols.route, cell: (r) => label(r.route_role) },
  { key: 'count', header: c.cols.count, cell: (r) => String(r.count) },
]
const latencyCols: Column<Latency>[] = [
  { key: 'version', header: c.cols.agentVersion, cell: (r) => r.agent_version },
  { key: 'turns', header: c.cols.turns, cell: (r) => String(r.turns) },
  { key: 'p50', header: c.cols.p50, cell: (r) => ms(r.p50_ms) },
  { key: 'p90', header: c.cols.p90, cell: (r) => ms(r.p90_ms) },
]
const delegationCols: Column<Delegation>[] = [
  { key: 'version', header: c.cols.agentVersion, cell: (r) => r.agent_version },
  { key: 'actions', header: c.cols.actions, cell: (r) => String(r.actions) },
  { key: 'p50', header: c.cols.p50, cell: (r) => ms(r.p50_ms) },
  { key: 'p90', header: c.cols.p90, cell: (r) => ms(r.p90_ms) },
]

const KIND_ORDER: Record<Gate['kind'], number> = { gate: 0, harness: 1, live: 2 }
const orDash = (v: string | number | null) => (v === null ? c.dash : String(v))
const gateCols: Column<Gate>[] = [
  { key: 'kind', header: c.cols.kind, cell: (r) => c.reports.kinds[r.kind] },
  { key: 'story', header: c.cols.story, cell: (r) => orDash(r.story_id) },
  { key: 'mode', header: c.cols.mode, cell: (r) => label(r.mode) },
  { key: 'repeat', header: c.cols.repeat, cell: (r) => orDash(r.repeat) },
  { key: 'passed', header: c.cols.passed, cell: (r) => (r.passed ? c.reports.passed : c.reports.failed) },
  { key: 'stop', header: c.cols.stop, cell: (r) => label(r.stop) },
  { key: 'turns', header: c.cols.turnsBeforeRoute, cell: (r) => orDash(r.turns_before_route) },
  { key: 'duration', header: c.cols.duration, cell: (r) => (r.duration_s === null ? c.dash : r.duration_s.toFixed(1)) },
  { key: 'spend', header: c.cols.spend, cell: (r) => (r.spend_usd === null ? c.dash : `$${r.spend_usd.toFixed(2)}`) },
  {
    key: 'findings',
    header: c.cols.findings,
    cell: (r) =>
      r.findings.length === 0 ? c.dash : r.findings.map((f) => `${f.table} · ${f.key_name} · ${f.count}`).join('; '),
  },
]
const unapprovedCols: Column<Unapproved>[] = [
  { key: 'file', header: c.cols.file, cell: (r) => r.file },
  { key: 'status', header: c.cols.status, cell: (r) => label(r.status) },
]

/** Release-gate results and unapproved content come with every reports reply, whatever the call count. */
function ContentSections({ data, loading }: { data?: ReportsResponse; loading?: boolean }) {
  const gates = [...(data?.gate_results ?? [])].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
  // Tolerate replies from a server that predates the `unapproved` field.
  const unapproved: readonly Unapproved[] = Array.isArray(data?.unapproved) ? data.unapproved : []
  let gatesBody
  if (loading)
    gatesBody = <DataTable name="reports-gates" caption={c.reports.gatesCaption} columns={gateCols} loading skeletonRows={3} />
  else if (gates.length === 0) gatesBody = <EmptyState title={c.reports.gatesEmpty} data-testid="reports-gates-empty" />
  else gatesBody = <DataTable name="reports-gates" caption={c.reports.gatesCaption} columns={gateCols} rows={gates} />
  let unapprovedBody
  if (loading)
    unapprovedBody = (
      <DataTable name="reports-unapproved" caption={c.reports.unapprovedCaption} columns={unapprovedCols} loading skeletonRows={3} />
    )
  else if (unapproved.length === 0)
    unapprovedBody = <EmptyState title={c.reports.unapprovedEmpty} data-testid="reports-unapproved-empty" />
  else
    unapprovedBody = (
      <DataTable
        name="reports-unapproved"
        caption={c.reports.unapprovedCaption}
        columns={unapprovedCols}
        rows={unapproved}
        rowKey={(r) => r.file}
      />
    )
  return (
    <>
      <div className="admin-section" data-testid="reports-gates">
        <h2>{c.reports.gates}</h2>
        {gatesBody}
      </div>
      <div className="admin-section" data-testid="reports-unapproved">
        <h2>{c.reports.unapproved}</h2>
        {unapprovedBody}
      </div>
    </>
  )
}

interface Draft {
  from: string
  to: string
  period: Period
  version: string
}

function defaults(): Draft {
  const now = new Date()
  const from = new Date(now)
  from.setDate(now.getDate() - 30)
  return { from: localDate(from), to: localDate(now), period: 'day', version: '' }
}

const toParams = (d: Draft): ReportsParams => ({
  date_from: d.from || undefined,
  date_to: d.to || undefined,
  period: d.period,
  agent_version: d.version || undefined,
})

export function ReportsPage() {
  const [draft, setDraft] = useState<Draft>(defaults)
  const [params, setParams] = useState<ReportsParams>(() => toParams(draft))
  const q = useReports(params)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setParams(toParams(draft))
  }

  let body
  if (q.isPending)
    body = (
      <>
        <DataTable name="reports" caption={c.reports.outcomes} columns={outcomeCols} loading />
        <ContentSections loading />
      </>
    )
  else if (!q.data)
    body = <ErrorState message={c.reports.error} onRetry={() => void q.refetch()} data-testid="reports-error" />
  else if (q.data.total_calls === 0)
    body = (
      <>
        <EmptyState title={c.reports.empty} data-testid="reports-empty">
          {c.reports.emptyBody}
        </EmptyState>
        <ContentSections data={q.data} />
      </>
    )
  else {
    const r = q.data
    body = (
      <>
        <p className="admin-muted" data-testid="reports-total">
          {c.reports.total(r.total_calls)}
        </p>
        <DataTable name="reports-unmet" caption={c.reports.unmet} columns={unmetCols} rows={r.unmet_demand} />
        <DataTable name="reports-outcomes" caption={c.reports.outcomes} columns={outcomeCols} rows={r.outcomes} />
        <DataTable name="reports-routing" caption={c.reports.routing} columns={routingCols} rows={r.routing_mix} />
        <DataTable name="reports-latency" caption={c.reports.latency} columns={latencyCols} rows={r.latency} />
        <DataTable name="reports-delegation" caption={c.reports.delegation} columns={delegationCols} rows={r.delegation} />
        <ContentSections data={r} />
      </>
    )
  }

  return (
    <AdminPage page="reports">
      <form className="admin-filters" aria-label={c.reports.form} onSubmit={submit} data-testid="reports-filters">
        <TextField
          label={c.calls.dateFrom}
          type="date"
          value={draft.from}
          onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          data-testid="reports-filter-from"
        />
        <TextField
          label={c.calls.dateTo}
          type="date"
          value={draft.to}
          onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          data-testid="reports-filter-to"
        />
        <SelectField
          label={c.reports.period}
          value={draft.period}
          onChange={(v) => setDraft({ ...draft, period: v === 'week' ? 'week' : 'day' })}
          options={[
            { value: 'day', label: c.reports.day },
            { value: 'week', label: c.reports.week },
          ]}
          testId="reports-filter-period"
        />
        <TextField
          label={c.cols.agentVersion}
          value={draft.version}
          onChange={(e) => setDraft({ ...draft, version: e.target.value })}
          data-testid="reports-filter-version"
        />
        <div className="admin-actions admin-filters__actions">
          <Button type="submit" data-testid="reports-apply">
            {c.apply}
          </Button>
        </div>
      </form>
      {body}
    </AdminPage>
  )
}
