import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AdminApiError } from '../../api/admin'
import { problemsFor, useCatalog, useConfigState, useForm, useSaveForm, type Problem } from '../../api/config'
import { AdminPage, ResultNotice } from '../../admin/DataTable'
import { CheckboxInput, ListTextField, SelectInput } from '../../admin/EditDialog'
import { adminCopy } from '../../admin/copy'
import { UNSAVED_MESSAGE, useUnsavedGuard } from '../../admin/useUnsavedGuard'
import { Button, EmptyState, ErrorState, TextField } from '../../ui'
import { ConfigStateBar } from './KnowledgePage'

const c = adminCopy.forms
const NAME = /^[a-z][a-z0-9_]{2,31}$/
const KEY = /^[a-z][a-z0-9_]*$/
type Spec = Record<string, unknown> & { type: string }
interface Row {
  /** Stable React key while fields are reordered or renamed (never sent). */
  uid: number
  key: string
  spec: Spec
}

let nextUid = 0
const uid = () => ++nextUid
interface FormValue {
  name: string
  title: string
  status: string
  source: string | null
  rows: Row[]
  guard_keys: string[]
  never_collect: string[]
  archived: boolean
}

const BLANK: FormValue = { name: '', title: '', status: 'UNAPPROVED', source: null, rows: [], guard_keys: [], never_collect: [], archived: false }
const TYPE_PROPS: Record<string, string[]> = {
  text: ['max_length'],
  enum: ['values', 'stop_values'],
  bool: [],
  list: ['max_items', 'max_length'],
  number: ['minimum', 'maximum'],
  date: [],
}
const ALL_TYPED = ['max_length', 'values', 'stop_values', 'max_items', 'minimum', 'maximum']
const DEFAULTS: Record<string, Record<string, unknown>> = {
  text: { max_length: 200 },
  enum: { values: [] },
  list: { max_items: 10, max_length: 100 },
}

function fromServer(v: unknown): FormValue {
  const r = (v ?? {}) as Record<string, unknown>
  const fields = (r.fields ?? {}) as Record<string, Spec>
  return {
    name: String(r.name ?? ''),
    title: String(r.title ?? ''),
    status: String(r.status ?? 'UNAPPROVED'),
    source: (r.source as string | null) ?? null,
    rows: Object.entries(fields).map(([key, spec]) => ({ uid: uid(), key, spec })),
    guard_keys: (r.guard_keys as string[]) ?? [],
    never_collect: (r.never_collect as string[]) ?? [],
    archived: r.archived === true,
  }
}

function toServer(v: FormValue): Record<string, unknown> {
  const fields: Record<string, Spec> = {}
  for (const { key, spec } of v.rows) {
    const keep = new Set(TYPE_PROPS[spec.type] ?? [])
    const clean: Spec = { type: spec.type }
    for (const [k, val] of Object.entries(spec)) {
      if (ALL_TYPED.includes(k) && !keep.has(k)) continue
      if (val === '' || val === null || val === undefined) continue
      clean[k] = val
    }
    fields[key] = clean
  }
  return {
    name: v.name,
    title: v.title,
    status: v.status,
    source: v.source,
    fields,
    guard_keys: v.guard_keys.filter((k) => k in fields),
    never_collect: v.never_collect,
    archived: v.archived,
  }
}

function num(v: string): number | null {
  const t = v.trim()
  return t === '' || !Number.isFinite(Number(t)) ? null : Math.trunc(Number(t))
}

/** /admin/forms/new and /admin/forms/:name — the form builder. */
export function FormBuilderPage() {
  const params = useParams()
  const creating = params.name === undefined
  const name = params.name ?? ''
  const q = useForm(name)
  const state = useConfigState()
  const catalog = useCatalog()
  // Unsaved edits; null = show the draft as stored (or a blank new form).
  const [edits, setEdits] = useState<FormValue | null>(null)
  const [saved, setSaved] = useState<{ ok: boolean; n: number; problems: Problem[] } | null>(null)
  const stored = useMemo(() => (creating || !q.data ? BLANK : fromServer(q.data.value)), [creating, q.data])
  const value: FormValue = edits ?? stored
  const dirty = edits !== null
  const save = useSaveForm(creating ? value.name : name)
  const navigate = useNavigate()
  useUnsavedGuard(dirty)

  const canEdit = state.data?.can_edit ?? false
  const locked = !canEdit
  const set = (patch: Partial<FormValue>) => setEdits({ ...value, ...patch })
  const setRow = (i: number, row: Row) => set({ rows: value.rows.map((r, j) => (j === i ? row : r)) })
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= value.rows.length) return
    const rows = [...value.rows]
    ;[rows[i], rows[j]] = [rows[j], rows[i]]
    set({ rows })
  }
  const formName = creating ? value.name : name
  const problems = saved?.problems.length ? saved.problems : problemsFor(state.data?.draft_problems, `forms.${formName}`)
  const fieldProblems = (key: string) => problems.filter((p) => p.path.startsWith(`fields.${key}`))
  const nameError = creating && value.name !== '' && (!NAME.test(value.name) || value.name === 'new') ? c.name : null
  const types = catalog.data?.field_types ?? []

  const onSave = () => {
    save.mutate(toServer(value), {
      onSuccess: (r) => {
        setEdits(null)
        setSaved((p) => ({ ok: true, n: (p?.n ?? 0) + 1, problems: r.draft_problems.filter((x) => x.document === `forms.${value.name}`) }))
        if (creating) navigate(`/admin/forms/${value.name}`, { replace: true })
      },
      onError: (e) => {
        const list = e && typeof e === 'object' && 'problems' in e ? ((e as { problems: Problem[] }).problems ?? []) : []
        setSaved((p) => ({ ok: false, n: (p?.n ?? 0) + 1, problems: list }))
      },
    })
  }
  const back = () => {
    if (!dirty || window.confirm(UNSAVED_MESSAGE)) navigate('/admin/forms')
  }

  if (!creating && q.isPending) {
    return (
      <AdminPage page="form-builder">
        <div className="admin-panel admin-section" aria-busy="true" data-testid="form-loading">
          <span className="admin-skeleton" />
          <span className="admin-skeleton" />
        </div>
      </AdminPage>
    )
  }
  if (!creating && !q.data) {
    const notFound = q.error instanceof AdminApiError && q.error.isNotFound
    return (
      <AdminPage page="form-builder">
        {notFound ? (
          <EmptyState title={c.notFound} data-testid="form-not-found">
            <Link className="ui-link" to="/admin/forms">
              {adminCopy.config.back}
            </Link>
          </EmptyState>
        ) : (
          <ErrorState message={c.error} onRetry={() => void q.refetch()} data-testid="form-error" />
        )}
      </AdminPage>
    )
  }
  return (
    <AdminPage
      page="form-builder"
      actions={
        <Button variant="secondary" onClick={back} data-testid="form-back">
          {adminCopy.config.back}
        </Button>
      }
    >
      <ConfigStateBar />
      {problems.length ? (
        <div className="admin-panel admin-section" data-testid="form-problems">
          <h2>{c.problems}</h2>
          <ul className="admin-problems">
            {problems.map((p, i) => (
              <li key={i}>
                <code>{p.path}</code>: {p.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <form
        className="admin-panel admin-section admin-editor"
        data-testid="form-builder"
        onSubmit={(e) => {
          e.preventDefault()
          onSave()
        }}
      >
        {creating ? (
          <TextField label={c.name} value={value.name} error={nameError} disabled={locked} onChange={(e) => set({ name: e.target.value.trim() })} data-testid="form-name" />
        ) : (
          <p>
            <span className="admin-muted">{adminCopy.agents.name}: </span>
            <code>{name}</code>
          </p>
        )}
        <TextField label={c.title} value={value.title} maxLength={120} disabled={locked} onChange={(e) => set({ title: e.target.value })} data-testid="form-title" />
        <SelectInput label={adminCopy.config.status} value={value.status} options={adminCopy.config.statusOptions} disabled={locked} onChange={(v) => set({ status: v })} testId="form-status" />
        <h2>{c.fields}</h2>
        <p className="admin-muted">{c.fieldsHint}</p>
        <ol className="admin-fields" data-testid="form-fields">
          {value.rows.map((row, i) => {
            const t = row.spec.type
            const props = TYPE_PROPS[t] ?? []
            const rowProblems = fieldProblems(row.key)
            const sp = (patch: Record<string, unknown>) => setRow(i, { ...row, spec: { ...row.spec, ...patch } })
            return (
              <li key={row.uid} className="admin-fieldcard" data-testid={`form-field-${i}`}>
                <div className="admin-fieldcard__grid">
                  <TextField label={c.key} value={row.key} error={row.key && !KEY.test(row.key) ? c.key : null} disabled={locked} onChange={(e) => setRow(i, { ...row, key: e.target.value.trim() })} data-testid={`form-field-${i}-key`} />
                  <TextField label={c.label} value={String(row.spec.label ?? '')} maxLength={80} disabled={locked} onChange={(e) => sp({ label: e.target.value })} data-testid={`form-field-${i}-label`} />
                  <SelectInput
                    label={c.type}
                    value={t}
                    options={types.map((x) => ({ value: x.type, label: x.label }))}
                    disabled={locked}
                    onChange={(v) => setRow(i, { ...row, spec: { ...row.spec, type: v, ...(DEFAULTS[v] ?? {}) } })}
                    testId={`form-field-${i}-type`}
                  />
                  <TextField label={c.help} value={String(row.spec.help ?? '')} maxLength={300} disabled={locked} onChange={(e) => sp({ help: e.target.value })} data-testid={`form-field-${i}-help`} />
                  <TextField label={c.readback} value={String(row.spec.readback_label ?? '')} maxLength={80} disabled={locked} onChange={(e) => sp({ readback_label: e.target.value })} data-testid={`form-field-${i}-readback`} />
                  {props.includes('values') ? (
                    <ListTextField label={c.values} value={row.spec.values} disabled={locked} onChange={(v) => sp({ values: v })} testId={`form-field-${i}-values`} />
                  ) : null}
                  {props.includes('stop_values') ? (
                    <ListTextField label={c.stopValues} value={row.spec.stop_values} disabled={locked} onChange={(v) => sp({ stop_values: v })} testId={`form-field-${i}-stop`} />
                  ) : null}
                  {props.includes('max_length') ? (
                    <TextField label={c.maxLength} inputMode="numeric" value={row.spec.max_length == null ? '' : String(row.spec.max_length)} disabled={locked} onChange={(e) => sp({ max_length: num(e.target.value) })} data-testid={`form-field-${i}-maxlen`} />
                  ) : null}
                  {props.includes('max_items') ? (
                    <TextField label={c.maxItems} inputMode="numeric" value={row.spec.max_items == null ? '' : String(row.spec.max_items)} disabled={locked} onChange={(e) => sp({ max_items: num(e.target.value) })} data-testid={`form-field-${i}-maxitems`} />
                  ) : null}
                  {props.includes('minimum') ? (
                    <TextField label={c.minimum} inputMode="numeric" value={row.spec.minimum == null ? '' : String(row.spec.minimum)} disabled={locked} onChange={(e) => sp({ minimum: num(e.target.value) })} data-testid={`form-field-${i}-min`} />
                  ) : null}
                  {props.includes('maximum') ? (
                    <TextField label={c.maximum} inputMode="numeric" value={row.spec.maximum == null ? '' : String(row.spec.maximum)} disabled={locked} onChange={(e) => sp({ maximum: num(e.target.value) })} data-testid={`form-field-${i}-max`} />
                  ) : null}
                  <CheckboxInput label={c.required} checked={row.spec.required === true} disabled={locked} onChange={(on) => sp({ required: on })} testId={`form-field-${i}-required`} />
                </div>
                {rowProblems.length ? (
                  <ul className="admin-problems" data-testid={`form-field-${i}-problems`}>
                    {rowProblems.map((p, k) => (
                      <li key={k}>{p.message}</li>
                    ))}
                  </ul>
                ) : null}
                {!locked ? (
                  <div className="admin-actions">
                    <Button variant="secondary" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${c.moveUp}: ${row.key}`} data-testid={`form-field-${i}-up`}>
                      ↑
                    </Button>
                    <Button variant="secondary" disabled={i === value.rows.length - 1} onClick={() => move(i, 1)} aria-label={`${c.moveDown}: ${row.key}`} data-testid={`form-field-${i}-down`}>
                      ↓
                    </Button>
                    <Button variant="secondary" onClick={() => set({ rows: value.rows.filter((_, j) => j !== i) })} data-testid={`form-field-${i}-remove`}>
                      {c.remove}
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
        {!locked && value.rows.length < (catalog.data?.limits.form_fields_max ?? 30) ? (
          <Button
            variant="secondary"
            onClick={() =>
              set({ rows: [...value.rows, { uid: uid(), key: '', spec: { type: 'text', max_length: 200, label: '', help: '', readback_label: '' } }] })
            }
            data-testid="form-add-field"
          >
            {c.addField}
          </Button>
        ) : null}
        <details className="admin-details">
          <summary>{c.neverCollect}</summary>
          <p className="admin-muted">{(catalog.data?.floor.never_collect_keys ?? []).join(', ')}</p>
        </details>
        <CheckboxInput label={c.archivedLabel} checked={value.archived} disabled={locked} onChange={(on) => set({ archived: on })} testId="form-archived" />
        {saved ? (
          <ResultNotice testId="form-result" focusKey={saved.n} tone={saved.ok ? 'info' : 'warning'}>
            {saved.ok ? adminCopy.config.saved : adminCopy.config.saveFailed}
          </ResultNotice>
        ) : null}
        {canEdit ? (
          <div className="admin-actions admin-sticky-actions">
            <Button type="submit" disabled={!dirty || save.isPending || (creating && (!value.name || nameError !== null))} data-testid="form-save">
              {save.isPending ? adminCopy.config.saving : adminCopy.config.save}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminPage>
  )
}
