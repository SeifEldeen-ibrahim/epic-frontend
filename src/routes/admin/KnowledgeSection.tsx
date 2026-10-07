import { useMemo, useState } from 'react'
import {
  problemsFor,
  useAgents,
  useCatalog,
  useKnowledgeSection,
  useSaveKnowledge,
  type Catalog,
  type KnowledgeSection,
  type Problem,
} from '../../api/config'
import { DataTable, type Column } from '../../admin/DataTable'
import { EditDialog, FloorList, SelectInput, type FieldDef, type Rec } from '../../admin/EditDialog'
import { adminCopy } from '../../admin/copy'
import { useUnsavedGuard } from '../../admin/useUnsavedGuard'
import { Button, EmptyState, ErrorState, TextArea, TextField } from '../../ui'

const c = adminCopy.config

/** Editable list sections: the list key in the document and the row's id field. */
const ROWS: Partial<Record<KnowledgeSection, { list: string; id: string; fields: (agents: string[]) => FieldDef[] }>> = {
  routing: {
    list: 'roles',
    id: 'role',
    fields: (agents) => [
      { key: 'role', label: 'Key (lowercase, no spaces)', kind: 'text', fixedAfterCreate: true, max: 40 },
      { key: 'title', label: 'Title (what callers hear)', kind: 'text', max: 80 },
      { key: 'terms', label: 'Need words that belong here', kind: 'list' },
      {
        key: 'handled_by',
        label: 'Handled by',
        kind: 'select',
        options: [{ value: '', label: 'A department (the caller hears the line)' }, ...agents.map((a) => ({ value: a, label: `Agent: ${a} (caller passed on live)` }))],
      },
      { key: 'say', label: 'Line in opening hours', kind: 'textarea', max: 400 },
      { key: 'after_hours_say', label: 'Line after hours', kind: 'textarea', max: 400 },
      { key: 'extension', label: 'Extension (staff record, never spoken)', kind: 'text', max: 10 },
      { key: 'department', label: 'Department (staff record, never spoken)', kind: 'text', max: 200 },
      { key: 'source', label: 'Source', kind: 'text', max: 80 },
    ],
  },
  services: {
    list: 'services',
    id: 'key',
    fields: () => [
      { key: 'key', label: 'Key (lowercase, no spaces)', kind: 'text', fixedAfterCreate: true, max: 60 },
      { key: 'name', label: 'Name', kind: 'text', max: 120 },
      { key: 'aliases', label: 'Other names', kind: 'list' },
      { key: 'description', label: 'Description', kind: 'textarea', max: 600 },
      { key: 'documents', label: 'Documents needed', kind: 'textarea', max: 400 },
      { key: 'wait_time', label: 'Wait time', kind: 'text', max: 200 },
      { key: 'location', label: 'Location', kind: 'text', max: 200 },
      { key: 'directions', label: 'Directions', kind: 'textarea', max: 400 },
      { key: 'source', label: 'Source', kind: 'text', max: 80 },
    ],
  },
  referrals: {
    list: 'categories',
    id: 'key',
    fields: () => [
      { key: 'key', label: 'Key (lowercase, no spaces)', kind: 'text', fixedAfterCreate: true, max: 60 },
      { key: 'label', label: 'Label', kind: 'text', max: 120 },
      { key: 'terms', label: 'Need words', kind: 'list' },
      { key: 'referral', label: 'Referral line (one reply)', kind: 'textarea', max: 600 },
      { key: 'source', label: 'Source', kind: 'text', max: 80 },
    ],
  },
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DAY_LABEL: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }

function rowText(row: Rec): string {
  return Object.values(row)
    .map((v) => (Array.isArray(v) ? v.join(' ') : String(v ?? '')))
    .join(' ')
    .toLowerCase()
}

function ProblemList({ problems, testId }: { problems: Problem[]; testId: string }) {
  if (problems.length === 0) return null
  return (
    <ul className="admin-problems" data-testid={testId}>
      {problems.map((p, i) => (
        <li key={i}>
          <code>{p.path}</code>: {p.message}
        </li>
      ))}
    </ul>
  )
}

/** One knowledge section of the draft: view (everyone) and edit (admins). */
export function KnowledgeSection({
  section,
  canEdit,
  problems,
}: {
  section: KnowledgeSection
  canEdit: boolean
  problems: readonly Problem[]
}) {
  const q = useKnowledgeSection(section)
  const save = useSaveKnowledge(section)
  const catalog = useCatalog()
  const agents = useAgents()
  // Unsaved edits; null = show the draft as stored.
  const [edits, setEdits] = useState<Rec | null>(null)
  const [result, setResult] = useState<'saved' | 'failed' | null>(null)
  const value = edits ?? ((q.data?.value as Rec | undefined) ?? null)
  const dirty = edits !== null
  useUnsavedGuard(dirty)

  const update = (next: Rec) => {
    setEdits(next)
    setResult(null)
  }
  const onSave = () => {
    if (!value) return
    save.mutate(value, {
      onSuccess: () => {
        setEdits(null)
        setResult('saved')
      },
      onError: () => setResult('failed'),
    })
  }

  if (q.isPending) {
    return (
      <div className="admin-panel admin-section" aria-busy="true" data-testid={`knowledge-${section}-loading`}>
        <span className="admin-sr-only">{c.loading}</span>
        <span className="admin-skeleton" />
        <span className="admin-skeleton" />
        <span className="admin-skeleton" />
      </div>
    )
  }
  if (!q.data || !value) {
    return <ErrorState message={c.error} onRetry={() => void q.refetch()} data-testid={`knowledge-${section}-error`} />
  }
  const sectionProblems = problemsFor(problems, `knowledge.${section}`)
  const agentNames = (agents.data?.agents ?? []).filter((a) => !a.archived).map((a) => a.name)

  return (
    <div className="admin-panel admin-section" data-testid={`knowledge-${section}`}>
      <p className="admin-muted">{c.sectionHints[section]}</p>
      <ProblemList problems={sectionProblems} testId={`knowledge-${section}-problems`} />
      <SelectInput
        label={c.status}
        value={String(value.status ?? 'UNAPPROVED')}
        options={c.statusOptions}
        disabled={!canEdit}
        onChange={(v) => update({ ...value, status: v })}
        testId={`knowledge-${section}-status`}
      />
      <SectionBody section={section} value={value} canEdit={canEdit} onChange={update} catalog={catalog.data} agents={agentNames} />
      {canEdit ? (
        <div className="admin-actions admin-sticky-actions">
          <Button onClick={onSave} disabled={!dirty || save.isPending} data-testid={`knowledge-${section}-save`}>
            {save.isPending ? c.saving : c.save}
          </Button>
          {result ? (
            <span role="status" className={result === 'saved' ? 'admin-muted' : 'ui-field__error'} data-testid={`knowledge-${section}-result`}>
              {result === 'saved' ? c.saved : c.saveFailed}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SectionBody({
  section,
  value,
  canEdit,
  onChange,
  catalog,
  agents,
}: {
  section: KnowledgeSection
  value: Rec
  canEdit: boolean
  onChange: (next: Rec) => void
  catalog: Catalog | undefined
  agents: string[]
}) {
  const rows = ROWS[section]
  if (rows) return <RowsEditor section={section} spec={rows} value={value} canEdit={canEdit} onChange={onChange} agents={agents} />
  if (section === 'hours') return <HoursEditor value={value} canEdit={canEdit} onChange={onChange} />
  if (section === 'wording') return <WordingEditor value={value} canEdit={canEdit} onChange={onChange} />
  const floor = catalog?.floor
  const list = (k: string): string[] => (Array.isArray(value[k]) ? (value[k] as string[]) : [])
  if (section === 'crisis') {
    const kw = (value.keywords as Rec | undefined) ?? {}
    const kwList = (k: string): string[] => (Array.isArray(kw[k]) ? (kw[k] as string[]) : [])
    const agency = (value.agency_keywords as Record<string, string[]> | undefined) ?? {}
    return (
      <div className="admin-section">
        <div className="admin-locked-text" data-testid="crisis-instruction">
          <span className="admin-badge">{c.lockedBadge}</span>
          <p>{floor?.crisis_instruction}</p>
          <p>{floor?.crisis_instruction_es}</p>
        </div>
        <FloorList
          label="Crisis phrases (English)"
          floor={floor?.crisis_en ?? []}
          additions={kwList('en')}
          onChange={(v) => onChange({ ...value, keywords: { ...kw, en: v } })}
          disabled={!canEdit}
          testId="crisis-en"
          lockedNote={c.locked}
        />
        <FloorList
          label="Crisis phrases (Spanish)"
          floor={floor?.crisis_es ?? []}
          additions={kwList('es')}
          onChange={(v) => onChange({ ...value, keywords: { ...kw, es: v } })}
          disabled={!canEdit}
          testId="crisis-es"
          lockedNote={c.locked}
        />
        {Object.entries(floor?.crisis_agency ?? {}).map(([org, terms]) => (
          <FloorList
            key={org}
            label={`Agency words: ${org}`}
            floor={terms}
            additions={agency[org] ?? []}
            onChange={(v) => onChange({ ...value, agency_keywords: { ...agency, [org]: v } })}
            disabled={!canEdit}
            testId={`crisis-agency-${org}`}
            lockedNote={c.locked}
          />
        ))}
      </div>
    )
  }
  if (section === 'never_spoken') {
    return (
      <div className="admin-section">
        <FloorList label="Staff names" floor={floor?.staff_names ?? []} additions={list('staff_names')} onChange={(v) => onChange({ ...value, staff_names: v })} disabled={!canEdit} testId="never-staff" lockedNote={c.locked} />
        <FloorList label="Terms" floor={floor?.denylist ?? []} additions={list('denylist')} onChange={(v) => onChange({ ...value, denylist: v })} disabled={!canEdit} testId="never-terms" lockedNote={c.locked} />
        <FloorList label="Terms (exact case)" floor={floor?.denylist_case_sensitive ?? []} additions={list('denylist_case_sensitive')} onChange={(v) => onChange({ ...value, denylist_case_sensitive: v })} disabled={!canEdit} testId="never-case" lockedNote={c.locked} />
      </div>
    )
  }
  // clinic
  return (
    <div className="admin-section">
      <FloorList label="Clinical terms" floor={floor?.clinical_terms ?? []} additions={list('clinical_terms')} onChange={(v) => onChange({ ...value, clinical_terms: v })} disabled={!canEdit} testId="clinic-terms" lockedNote={c.locked} />
      <FloorList label="Not clinical (exceptions)" hint="An exception can never contain a clinical term." floor={floor?.clinical_exclusions ?? []} additions={list('clinical_exclusions')} onChange={(v) => onChange({ ...value, clinical_exclusions: v })} disabled={!canEdit} testId="clinic-exclusions" lockedNote={c.locked} />
      <FloorList label="Words never stored in a form" floor={floor?.never_collect_terms ?? []} additions={list('never_collect_terms')} onChange={(v) => onChange({ ...value, never_collect_terms: v })} disabled={!canEdit} testId="clinic-never-collect" lockedNote={c.locked} />
      {(['submitted', 'submitted_after_hours', 'custody'] as const).map((k) => (
        <TextArea
          key={k}
          label={{ submitted: 'Line after a request is submitted', submitted_after_hours: 'Line after a request is submitted after hours', custody: 'Line for a custody or records concern' }[k]}
          value={String(value[k] ?? '')}
          rows={3}
          max={400}
          disabled={!canEdit}
          onChange={(e) => onChange({ ...value, [k]: e.target.value })}
          data-testid={`clinic-${k}`}
        />
      ))}
    </div>
  )
}

function RowsEditor({
  section,
  spec,
  value,
  canEdit,
  onChange,
  agents,
}: {
  section: KnowledgeSection
  spec: { list: string; id: string; fields: (agents: string[]) => FieldDef[] }
  value: Rec
  canEdit: boolean
  onChange: (next: Rec) => void
  agents: string[]
}) {
  const rows = useMemo(() => (Array.isArray(value[spec.list]) ? (value[spec.list] as Rec[]) : []), [value, spec.list])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<{ index: number | null; row: Rec; n: number } | null>(null)
  const [opened, setOpened] = useState(0)
  const open = (index: number | null, row: Rec) => {
    setOpened((n) => n + 1)
    setEditing({ index, row, n: opened + 1 })
  }
  const fields = spec.fields(agents)
  const shown = rows.map((row, index) => ({ row, index })).filter(({ row }) => !search || rowText(row).includes(search.toLowerCase()))
  const columns: Column<{ row: Rec; index: number }>[] = [
    { key: 'id', header: fields[0].label.split(' (')[0], cell: ({ row }) => <code>{String(row[spec.id] ?? '')}</code> },
    { key: 'name', header: fields[1].label.split(' (')[0], cell: ({ row }) => String(row[fields[1].key] ?? '') },
    ...(section === 'routing'
      ? [{ key: 'handled', header: 'Handled by', cell: ({ row }: { row: Rec }) => (row.handled_by ? `Agent: ${String(row.handled_by)}` : 'Department') }]
      : []),
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: c.edit,
            cell: ({ row, index }: { row: Rec; index: number }) => (
              <div className="admin-actions">
                <Button variant="secondary" onClick={() => open(index, row)} data-testid={`${section}-edit-${String(row[spec.id])}`}>
                  {c.edit}
                </Button>
                <Button variant="secondary" onClick={() => onChange({ ...value, [spec.list]: rows.filter((_, j) => j !== index) })} data-testid={`${section}-remove-${String(row[spec.id])}`}>
                  {c.remove}
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ]
  return (
    <div className="admin-section">
      {section === 'routing' ? (
        <TextField
          label="Benefit words (never routed on their own)"
          hint="Separate entries with commas."
          value={Array.isArray(value.entitlement_words) ? (value.entitlement_words as string[]).join(', ') : ''}
          disabled={!canEdit}
          onChange={(e) => onChange({ ...value, entitlement_words: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          data-testid="routing-entitlement"
        />
      ) : null}
      <div className="admin-actions">
        <TextField label={c.search} type="search" value={search} onChange={(e) => setSearch(e.target.value)} data-testid={`${section}-search`} />
        {canEdit ? (
          <Button onClick={() => open(null, {})} data-testid={`${section}-add`}>
            {c.add}
          </Button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <EmptyState title={c.empty} data-testid={`${section}-empty`} />
      ) : shown.length === 0 ? (
        <EmptyState title={c.noMatch} data-testid={`${section}-nomatch`} />
      ) : (
        <DataTable name={`knowledge-${section}`} caption={c.sections[section]} columns={columns} rows={shown} rowKey={(r) => `${r.index}`} />
      )}
      <EditDialog
        key={editing ? `open-${editing.n}` : 'closed'}
        open={editing !== null}
        title={editing?.index == null ? `${c.add}: ${c.sections[section]}` : `${c.edit}: ${String(editing.row[spec.id] ?? '')}`}
        fields={fields}
        initial={editing?.row ?? {}}
        creating={editing?.index == null}
        saving={false}
        onCancel={() => setEditing(null)}
        onSave={(row) => {
          const clean: Rec = { ...row }
          if (clean.handled_by === '') clean.handled_by = null
          const next = editing?.index == null ? [...rows, clean] : rows.map((r, j) => (j === editing.index ? clean : r))
          onChange({ ...value, [spec.list]: next })
          setEditing(null)
        }}
        testId={`${section}-dialog`}
      />
    </div>
  )
}

function HoursEditor({ value, canEdit, onChange }: { value: Rec; canEdit: boolean; onChange: (next: Rec) => void }) {
  const weekly = (value.weekly as Record<string, [string, string] | null> | undefined) ?? {}
  const closures = Array.isArray(value.closures) ? (value.closures as { date: string; reason: string }[]) : []
  const setDay = (day: string, span: [string, string] | null) => onChange({ ...value, weekly: { ...weekly, [day]: span } })
  return (
    <div className="admin-section">
      <TextField label="Time zone" value={String(value.timezone ?? '')} disabled={!canEdit} onChange={(e) => onChange({ ...value, timezone: e.target.value })} data-testid="hours-timezone" />
      <div className="admin-hours" data-testid="hours-weekly">
        {DAYS.map((day) => {
          const span = weekly[day] ?? null
          return (
            <fieldset key={day} className="admin-hours__day">
              <legend>{DAY_LABEL[day]}</legend>
              <label className="admin-check">
                <input
                  type="checkbox"
                  className="admin-check__box"
                  checked={span === null}
                  disabled={!canEdit}
                  onChange={(e) => setDay(day, e.target.checked ? null : ['09:00', '17:00'])}
                  data-testid={`hours-${day}-closed`}
                />
                <span>Closed</span>
              </label>
              {span ? (
                <div className="admin-hours__times">
                  <TextField label="Opens" type="time" value={span[0]} disabled={!canEdit} onChange={(e) => setDay(day, [e.target.value, span[1]])} data-testid={`hours-${day}-open`} />
                  <TextField label="Closes" type="time" value={span[1]} disabled={!canEdit} onChange={(e) => setDay(day, [span[0], e.target.value])} data-testid={`hours-${day}-close`} />
                </div>
              ) : null}
            </fieldset>
          )
        })}
      </div>
      <h3>Closure days</h3>
      {closures.length === 0 ? <p className="admin-muted">No closure days.</p> : null}
      {closures.map((cl, i) => (
        <div key={i} className="admin-hours__closure">
          <TextField label="Date" type="date" value={cl.date} disabled={!canEdit} onChange={(e) => onChange({ ...value, closures: closures.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} data-testid={`hours-closure-${i}-date`} />
          <TextField label="Reason" value={cl.reason} disabled={!canEdit} onChange={(e) => onChange({ ...value, closures: closures.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)) })} data-testid={`hours-closure-${i}-reason`} />
          {canEdit ? (
            <Button variant="secondary" onClick={() => onChange({ ...value, closures: closures.filter((_, j) => j !== i) })} data-testid={`hours-closure-${i}-remove`}>
              {c.remove}
            </Button>
          ) : null}
        </div>
      ))}
      {canEdit ? (
        <Button variant="secondary" onClick={() => onChange({ ...value, closures: [...closures, { date: '', reason: '' }] })} data-testid="hours-closure-add">
          Add a closure day
        </Button>
      ) : null}
    </div>
  )
}

const WORDING_LABELS: Record<string, string> = {
  greeting: 'Greeting (must keep the recording notice)',
  human_needed: 'A person must help',
  claim_correction: 'Correction after a false claim',
  clinic_claim_correction: 'Correction after a false claim (form agents)',
  after_hours_note: 'After-hours note (keep {next_opening})',
  current_client: 'Current client recorded (keep {title})',
  not_found: 'No approved information',
  refusal_suffix: 'Refusal suffix (instruction to the agent)',
  reconnect_line: 'After a dropped line',
  reconnect_greeting: 'Reconnect instruction (to the agent)',
}

function WordingEditor({ value, canEdit, onChange }: { value: Rec; canEdit: boolean; onChange: (next: Rec) => void }) {
  const keys = Object.keys(value).filter((k) => k !== 'status' && typeof value[k] === 'string')
  return (
    <div className="admin-section">
      {keys.map((k) => (
        <TextArea
          key={k}
          label={WORDING_LABELS[k] ?? (k.endsWith('_es') ? `${WORDING_LABELS[k.slice(0, -3)] ?? k} (Spanish)` : k)}
          rows={2}
          max={600}
          value={String(value[k] ?? '')}
          disabled={!canEdit}
          onChange={(e) => onChange({ ...value, [k]: e.target.value })}
          data-testid={`wording-${k}`}
        />
      ))}
    </div>
  )
}
