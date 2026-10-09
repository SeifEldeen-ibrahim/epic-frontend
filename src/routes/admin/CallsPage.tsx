import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { useCalls, type CallListResponse, type CallsParams } from '../../api/admin'
import { useLanguageCatalog } from '../../api/config'
import { AdminPage, CellLink, DataTable, Pager, SelectField, type Column } from '../../admin/DataTable'
import { adminCopy as c, formStatusTone, formatTime, label, orDash, outcomeTone } from '../../admin/copy'
import { Button, EmptyState, ErrorState, StatusBadge, TextField } from '../../ui'

type Item = CallListResponse['items'][number]
type Outcome = NonNullable<Item['outcome']>
type FormStatus = NonNullable<Item['form_status']>

const OUTCOMES: Outcome[] = [
  'routed',
  'referred',
  'clinic_form',
  'human_needed',
  'crisis',
  'department_handoff',
  'current_client_handoff',
  'abandoned',
  'error',
]
const FORM_STATUSES: FormStatus[] = [
  'being_filled',
  'flagged',
  'read_back',
  'awaiting_approval',
  'approved',
  'rejected',
  'incomplete',
]
const KEYS = [
  'date_from',
  'date_to',
  'outcome',
  'route_role',
  'form_status',
  'language',
  'has_open_flags',
  'tester',
  'agent_version',
] as const
type Key = (typeof KEYS)[number]
type Draft = Record<Key, string>

const any = { value: '', label: c.any }
const options = (values: readonly string[]) => [any, ...values.map((v) => ({ value: v, label: label(v) }))]

function readDraft(sp: URLSearchParams): Draft {
  const d = {} as Draft
  for (const k of KEYS) d[k] = sp.get(k) ?? ''
  return d
}

function toParams(d: Draft): CallsParams {
  return {
    date_from: d.date_from || undefined,
    date_to: d.date_to || undefined,
    outcome: (d.outcome || undefined) as Outcome | undefined,
    route_role: d.route_role || undefined,
    form_status: (d.form_status || undefined) as FormStatus | undefined,
    language: d.language || undefined,
    has_open_flags: d.has_open_flags === 'true' ? true : undefined,
    tester: d.tester || undefined,
    agent_version: d.agent_version || undefined,
  }
}

type Lang = { code: string; name: string }

/** A language's name; the stored value when the language list is not available. */
export const languageName = (langs: readonly Lang[] | undefined, value: string | null | undefined) =>
  value ? (langs?.find((l) => l.code === value)?.name ?? value) : c.dash

const makeColumns = (langs: readonly Lang[] | undefined): Column<Item>[] => [
  {
    key: 'started',
    header: c.cols.started,
    link: true,
    cell: (r) => <CellLink to={`/admin/calls/${r.id}`}>{formatTime(r.started_at)}</CellLink>,
  },
  {
    key: 'status',
    header: c.cols.status,
    cell: (r) => (
      <StatusBadge tone={r.status === 'live' ? 'warning' : 'ok'}>{r.status === 'live' ? c.calls.live : c.calls.ended}</StatusBadge>
    ),
  },
  {
    key: 'outcome',
    header: c.cols.outcome,
    cell: (r) => (r.outcome ? <StatusBadge tone={outcomeTone(r.outcome)}>{label(r.outcome)}</StatusBadge> : c.dash),
  },
  { key: 'route', header: c.cols.route, cell: (r) => label(r.route_role) },
  { key: 'language', header: c.cols.language, cell: (r) => languageName(langs, r.language) },
  {
    key: 'form',
    header: c.cols.formStatus,
    cell: (r) =>
      r.form_status ? <StatusBadge tone={formStatusTone(r.form_status)}>{label(r.form_status)}</StatusBadge> : c.dash,
  },
  { key: 'flags', header: c.cols.flags, cell: (r) => String(r.open_flags) },
  { key: 'tester', header: c.cols.tester, cell: (r) => orDash(r.tester_label) },
  { key: 'version', header: c.cols.agentVersion, cell: (r) => r.agent_version },
]

function Filters({ initial, onApply, onClear, langs }: { initial: Draft; onApply: (d: Draft) => void; onClear: () => void; langs?: readonly Lang[] }) {
  const [d, setD] = useState(initial)
  const set = (k: Key) => (v: string) => setD((prev) => ({ ...prev, [k]: v }))
  const text = (k: Key, fieldLabel: string, type = 'text') => (
    <TextField
      label={fieldLabel}
      type={type}
      value={d[k]}
      onChange={(e) => set(k)(e.target.value)}
      data-testid={`calls-filter-${k}`}
    />
  )
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onApply(d)
  }
  return (
    <form className="admin-filters" aria-label={c.calls.filters} onSubmit={submit} data-testid="calls-filters">
      {text('date_from', c.calls.dateFrom, 'date')}
      {text('date_to', c.calls.dateTo, 'date')}
      <SelectField label={c.cols.outcome} value={d.outcome} onChange={set('outcome')} options={options(OUTCOMES)} testId="calls-filter-outcome" />
      {text('route_role', c.cols.route)}
      <SelectField
        label={c.cols.formStatus}
        value={d.form_status}
        onChange={set('form_status')}
        options={options(FORM_STATUSES)}
        testId="calls-filter-form_status"
      />
      {langs ? (
        <SelectField
          label={c.cols.language}
          value={d.language}
          onChange={set('language')}
          options={[
            any,
            ...langs.map((l) => ({ value: l.code, label: l.name })),
            ...(d.language && !langs.some((l) => l.code === d.language) ? [{ value: d.language, label: d.language }] : []),
          ]}
          testId="calls-filter-language"
        />
      ) : (
        text('language', c.cols.language)
      )}
      <SelectField
        label={c.calls.hasFlags}
        value={d.has_open_flags}
        onChange={set('has_open_flags')}
        options={[any, { value: 'true', label: c.calls.onlyFlagged }]}
        testId="calls-filter-has_open_flags"
      />
      {text('tester', c.cols.tester)}
      {text('agent_version', c.cols.agentVersion)}
      <div className="admin-actions admin-filters__actions">
        <Button type="submit" data-testid="calls-apply">
          {c.apply}
        </Button>
        <Button variant="secondary" onClick={onClear} data-testid="calls-clear">
          {c.clear}
        </Button>
      </div>
    </form>
  )
}

export function CallsPage() {
  const [sp, setSp] = useSearchParams()
  const qs = sp.toString()
  const draft = readDraft(sp)
  const filtered = KEYS.some((k) => draft[k] !== '')
  const [pager, setPager] = useState<{ key: string; stack: string[] }>({ key: qs, stack: [] })
  const stack = pager.key === qs ? pager.stack : []
  const cursor = stack.length ? stack[stack.length - 1] : undefined
  const q = useCalls({ ...toParams(draft), cursor })
  const langs = useLanguageCatalog().data?.languages
  const columns = makeColumns(langs)

  const apply = (d: Draft) => {
    const next = new URLSearchParams()
    for (const k of KEYS) if (d[k]) next.set(k, d[k])
    setSp(next)
  }

  let body
  if (q.isPending) body = <DataTable name="calls" caption={c.calls.caption} columns={columns} loading />
  else if (!q.data) body = <ErrorState message={c.calls.error} onRetry={() => void q.refetch()} data-testid="calls-error" />
  else if (q.data.items.length === 0)
    body = filtered ? (
      <EmptyState title={c.calls.filteredEmpty} data-testid="calls-filtered-empty">
        {c.calls.filteredEmptyBody}
      </EmptyState>
    ) : (
      <EmptyState title={c.calls.empty} data-testid="calls-empty">
        {c.calls.emptyBody}
      </EmptyState>
    )
  else body = <DataTable name="calls" caption={c.calls.caption} columns={columns} rows={q.data.items} rowKey={(r) => r.id} />

  const next = q.data?.next_cursor ?? null
  return (
    <AdminPage page="calls">
      <Filters key={`${qs}|${langs ? 1 : 0}`} langs={langs} initial={draft} onApply={apply} onClear={() => setSp(new URLSearchParams())} />
      {body}
      <Pager
        name="calls"
        hasPrevious={stack.length > 0}
        hasNext={next !== null}
        onPrevious={() => setPager({ key: qs, stack: stack.slice(0, -1) })}
        onNext={() => next && setPager({ key: qs, stack: [...stack, next] })}
      />
    </AdminPage>
  )
}
