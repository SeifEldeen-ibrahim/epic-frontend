import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AdminApiError } from '../../api/admin'
import {
  problemsFor,
  useAgent,
  useCatalog,
  useCompiled,
  useConfigState,
  useForms,
  useKnowledgeSection,
  useSaveAgent,
  type Problem,
} from '../../api/config'
import { AdminPage, ResultNotice } from '../../admin/DataTable'
import { CheckboxInput, SelectInput } from '../../admin/EditDialog'
import { adminCopy } from '../../admin/copy'
import { describeProblem, fieldErrors, isBlank, slugify } from '../../admin/problems'
import { UNSAVED_MESSAGE, useUnsavedGuard } from '../../admin/useUnsavedGuard'
import { Button, EmptyState, ErrorState, TextArea, TextField } from '../../ui'

const c = adminCopy.agents
const cf = adminCopy.fields
const LABELS: Record<string, string> = {
  name: c.nameField,
  title: c.title,
  persona: c.persona,
  knowledge: c.knowledge,
  topic: c.topic,
  text: c.text,
  voice: c.voice,
  tools: c.tools,
  route_targets: 'Where it can send callers',
  form: c.formPick,
  handoff: c.handoff,
  bridge_say: c.bridgeSay,
  bridge_say_es: c.bridgeSayEs,
  greeting: c.greeting,
  archived: 'Archived',
}

function describe(p: Problem): string {
  return describeProblem(p, { list: 'knowledge', rowLabel: (seg) => (/^\d+$/.test(seg) ? cf.item(Number(seg) + 1) : seg), fieldLabel: (k) => LABELS[k] })
}
const FORM_TOOLS = ['save_fields', 'confirm_callback', 'submit_form']
const NAME = /^[a-z][a-z0-9_]{2,31}$/

interface Item {
  topic: string
  text: string
}
interface Handoff {
  bridge_say: string
  bridge_say_es: string
  greeting: string
}
interface AgentValue {
  name: string
  title: string
  persona: string
  knowledge: Item[]
  voice: string
  tools: string[]
  route_targets: string[]
  form: string | null
  handoff: Handoff | null
  archived: boolean
}

const BLANK: AgentValue = {
  name: '',
  title: '',
  persona: '',
  knowledge: [],
  voice: 'sage',
  tools: ['end_call'],
  route_targets: [],
  form: null,
  handoff: null,
  archived: false,
}

function fromServer(v: unknown): AgentValue {
  const r = (v ?? {}) as Partial<AgentValue>
  return { ...BLANK, ...r, knowledge: r.knowledge ?? [], tools: r.tools ?? [], route_targets: r.route_targets ?? [] }
}

function ProblemList({ problems }: { problems: Problem[] }) {
  if (!problems.length) return null
  return (
    <div className="admin-panel admin-section" data-testid="agent-problems">
      <h2>{c.problems}</h2>
      <ul className="admin-problems">
        {problems.map((p, i) => (
          <li key={i}>{describe(p)}</li>
        ))}
      </ul>
    </div>
  )
}

/** /admin/agents/new and /admin/agents/:name — plain business inputs only; code writes the
 * instructions for both voice modes (shown read-only at the bottom). */
export function AgentEditorPage() {
  const params = useParams()
  const creating = params.name === undefined
  const name = params.name ?? ''
  const q = useAgent(name)
  const state = useConfigState()
  const catalog = useCatalog()
  const routing = useKnowledgeSection('routing')
  const forms = useForms()
  // Unsaved edits; null = show the draft as stored (or a blank new agent).
  const [edits, setEdits] = useState<AgentValue | null>(null)
  const [saved, setSaved] = useState<{ ok: boolean; n: number; problems: Problem[] } | null>(null)
  const [showCompiled, setShowCompiled] = useState(false)
  // While creating, the agent name follows the title until the admin edits it.
  const [nameEdited, setNameEdited] = useState(false)
  const stored = useMemo(() => (creating || !q.data ? BLANK : fromServer(q.data.value)), [creating, q.data])
  const value: AgentValue = edits ?? stored
  const dirty = edits !== null
  const save = useSaveAgent(creating ? value.name : name)
  const compiled = useCompiled(name, showCompiled && !creating)
  const navigate = useNavigate()
  useUnsavedGuard(dirty)

  const canEdit = state.data?.can_edit ?? false
  const set = (patch: Partial<AgentValue>) => setEdits({ ...value, ...patch })
  const rows = useMemo(() => {
    const roles = ((routing.data?.value as { roles?: { role: string; title: string; handled_by?: string | null }[] } | undefined)?.roles ?? [])
    return roles.filter((r) => r.handled_by !== (creating ? value.name : name))
  }, [routing.data, creating, value.name, name])
  const tools = catalog.data?.tools ?? []
  const hasFormTools = FORM_TOOLS.every((t) => value.tools.includes(t))
  const hasRedirect = value.tools.includes('route_to')
  const problems = [
    ...problemsFor(state.data?.draft_problems, `agents.${creating ? value.name : name}`),
  ]
  const nameError = creating && value.name !== '' && (!NAME.test(value.name) || value.name === 'new') ? c.nameHint : null
  const shown = saved?.problems.length ? saved.problems : problems
  const errs = fieldErrors(shown)
  const errorFor = (key: string) => (errs[key] ? `${LABELS[key].split(' (')[0]} ${errs[key]}` : null)
  const itemError = (i: number, key: 'topic' | 'text') => {
    const p = shown.find((x) => x.path === `knowledge.${i}.${key}`)
    return p ? describe(p).split(': ').slice(1).join(': ') : null
  }
  const missing = [
    ...(isBlank(value.title) ? [c.title] : []),
    ...(creating && isBlank(value.name) ? [c.name] : []),
    ...(isBlank(value.persona) ? [c.persona] : []),
    ...value.knowledge.flatMap((k, i) => [
      ...(isBlank(k.topic) ? [`${cf.item(i + 1)}: ${c.topic}`] : []),
      ...(isBlank(k.text) ? [`${cf.item(i + 1)}: ${c.text}`] : []),
    ]),
  ]

  const toggleTool = (tool: string, on: boolean) => {
    const rest = value.tools.filter((t) => t !== tool)
    set({ tools: on ? [...rest, tool] : rest, ...(tool === 'route_to' && !on ? { route_targets: [] } : {}) })
  }
  const toggleForm = (on: boolean) => {
    const rest = value.tools.filter((t) => !FORM_TOOLS.includes(t))
    set({ tools: on ? [...rest, ...FORM_TOOLS] : rest, form: on ? value.form : null })
  }
  const onSave = () => {
    const body = {
      ...value,
      handoff: value.handoff && (value.handoff.bridge_say || value.handoff.bridge_say_es || value.handoff.greeting) ? value.handoff : null,
      tools: value.tools.includes('end_call') ? value.tools : [...value.tools, 'end_call'],
    }
    save.mutate(body, {
      onSuccess: (r) => {
        setEdits(null)
        setSaved((p) => ({ ok: true, n: (p?.n ?? 0) + 1, problems: r.draft_problems.filter((x) => x.document === `agents.${value.name}`) }))
        if (creating) navigate(`/admin/agents/${value.name}`, { replace: true })
      },
      onError: (e) => {
        const list = e && typeof e === 'object' && 'problems' in e ? ((e as { problems: Problem[] }).problems ?? []) : []
        setSaved((p) => ({ ok: false, n: (p?.n ?? 0) + 1, problems: list }))
      },
    })
  }
  const back = () => {
    if (!dirty || window.confirm(UNSAVED_MESSAGE)) navigate('/admin/agents')
  }

  if (!creating && q.isPending) {
    return (
      <AdminPage page="agent-editor">
        <div className="admin-panel admin-section" aria-busy="true" data-testid="agent-loading">
          <span className="admin-skeleton" />
          <span className="admin-skeleton" />
          <span className="admin-skeleton" />
        </div>
      </AdminPage>
    )
  }
  if (!creating && !q.data) {
    const notFound = q.error instanceof AdminApiError && q.error.isNotFound
    return (
      <AdminPage page="agent-editor">
        {notFound ? (
          <EmptyState title={c.notFound} data-testid="agent-not-found">
            <Link className="ui-link" to="/admin/agents">
              {adminCopy.config.back}
            </Link>
          </EmptyState>
        ) : (
          <ErrorState message={c.error} onRetry={() => void q.refetch()} data-testid="agent-error" />
        )}
      </AdminPage>
    )
  }
  const locked = !canEdit
  return (
    <AdminPage
      page="agent-editor"
      actions={
        <Button variant="secondary" onClick={back} data-testid="agent-back">
          {adminCopy.config.back}
        </Button>
      }
    >
      <ProblemList problems={shown} />
      <form
        className="admin-panel admin-section admin-editor"
        data-testid="agent-editor"
        onSubmit={(e) => {
          e.preventDefault()
          onSave()
        }}
      >
        <p className="admin-muted">{c.sameEditor}</p>
        <TextField
          label={c.title}
          need="required"
          hint={c.titleHint}
          value={value.title}
          maxLength={60}
          error={errorFor('title')}
          disabled={locked}
          onChange={(e) => set({ title: e.target.value, ...(creating && !nameEdited ? { name: slugify(e.target.value, 32) } : {}) })}
          data-testid="agent-title"
        />
        {creating ? (
          <details className="admin-details" open={nameError !== null || undefined} data-testid="agent-advanced">
            <summary>{cf.advanced}</summary>
            <TextField
              label={c.nameField}
              need="required"
              hint={c.nameHint}
              value={value.name}
              error={nameError}
              disabled={locked}
              onChange={(e) => {
                setNameEdited(true)
                set({ name: e.target.value.trim() })
              }}
              data-testid="agent-name"
            />
          </details>
        ) : (
          <p>
            <span className="admin-muted">{c.name}: </span>
            <code data-testid="agent-name-fixed">{name}</code>
          </p>
        )}
        <TextArea label={c.persona} need="required" error={errorFor('persona')} hint={c.personaHint} value={value.persona} max={catalog.data?.limits.persona_max ?? 1500} rows={5} disabled={locked} onChange={(e) => set({ persona: e.target.value })} data-testid="agent-persona" />
        <fieldset className="admin-fieldset" data-testid="agent-knowledge">
          <legend>{c.knowledge}</legend>
          <p className="admin-muted">{c.knowledgeHint}</p>
          {value.knowledge.map((item, i) => (
            <div key={i} className="admin-kitem">
              <TextField label={c.topic} need="required" error={itemError(i, 'topic')} value={item.topic} maxLength={80} disabled={locked} onChange={(e) => set({ knowledge: value.knowledge.map((x, j) => (j === i ? { ...x, topic: e.target.value } : x)) })} data-testid={`agent-knowledge-${i}-topic`} />
              <TextArea label={c.text} need="required" error={itemError(i, 'text')} value={item.text} max={catalog.data?.limits.knowledge_item_max ?? 500} rows={2} disabled={locked} onChange={(e) => set({ knowledge: value.knowledge.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} data-testid={`agent-knowledge-${i}-text`} />
              {!locked ? (
                <Button variant="secondary" onClick={() => set({ knowledge: value.knowledge.filter((_, j) => j !== i) })} data-testid={`agent-knowledge-${i}-remove`}>
                  {c.removeItem}
                </Button>
              ) : null}
            </div>
          ))}
          {!locked && value.knowledge.length < (catalog.data?.limits.knowledge_items_max ?? 40) ? (
            <Button variant="secondary" onClick={() => set({ knowledge: [...value.knowledge, { topic: '', text: '' }] })} data-testid="agent-knowledge-add">
              {c.addItem}
            </Button>
          ) : null}
        </fieldset>
        <SelectInput label={c.voice} value={value.voice} options={(catalog.data?.voices ?? [value.voice]).map((v) => ({ value: v, label: v }))} disabled={locked} onChange={(v) => set({ voice: v })} testId="agent-voice" />
        <fieldset className="admin-fieldset" data-testid="agent-tools">
          <legend>{c.tools}</legend>
          <p className="admin-muted">{c.toolsHint}</p>
          {tools
            .filter((t) => t.group === 'info' || t.group === 'redirect')
            .map((t) => (
              <CheckboxInput key={t.name} label={t.description} checked={value.tools.includes(t.name)} disabled={locked} onChange={(on) => toggleTool(t.name, on)} testId={`agent-tool-${t.name}`} />
            ))}
          {hasRedirect ? (
            <fieldset className="admin-fieldset admin-fieldset--nested" data-testid="agent-targets">
              <legend>{c.redirectTargets}</legend>
              <p className="admin-muted">{c.redirectHint}</p>
              {rows.length === 0 ? (
                <p className="admin-picker-empty" data-testid="agent-targets-empty">
                  {c.noTargets}{' '}
                  <Link className="ui-link" to="/admin/departments">
                    {c.addDepartment}
                  </Link>
                </p>
              ) : null}
              {rows.map((r) => (
                <CheckboxInput
                  key={r.role}
                  label={`${r.title} — ${r.handled_by ? c.agentTarget(r.handled_by) : c.departmentTarget}`}
                  checked={value.route_targets.includes(r.role)}
                  disabled={locked}
                  onChange={(on) => set({ route_targets: on ? [...value.route_targets, r.role] : value.route_targets.filter((x) => x !== r.role) })}
                  testId={`agent-target-${r.role}`}
                />
              ))}
            </fieldset>
          ) : null}
          <CheckboxInput label={c.formGroup} checked={hasFormTools} disabled={locked} onChange={toggleForm} testId="agent-tool-form" />
          {hasFormTools && forms.data && forms.data.forms.filter((f) => !f.archived).length === 0 ? (
            <p className="admin-picker-empty" data-testid="agent-form-empty">
              {c.noForms}{' '}
              <Link className="ui-link" to="/admin/forms/new">
                {c.createForm}
              </Link>
            </p>
          ) : hasFormTools ? (
            <SelectInput
              label={c.formPick}
              value={value.form ?? ''}
              options={[{ value: '', label: c.noForm }, ...(forms.data?.forms ?? []).filter((f) => !f.archived).map((f) => ({ value: f.name, label: `${f.title} (${f.name})` }))]}
              disabled={locked}
              onChange={(v) => set({ form: v || null })}
              testId="agent-form"
            />
          ) : null}
          {tools
            .filter((t) => t.group === 'end')
            .map((t) => (
              <CheckboxInput key={t.name} label={t.description} checked disabled onChange={() => undefined} testId={`agent-tool-${t.name}`} />
            ))}
        </fieldset>
        <fieldset className="admin-fieldset" data-testid="agent-handoff">
          <legend>{c.handoff}</legend>
          <TextField label={c.bridgeSay} need="optional" value={value.handoff?.bridge_say ?? ''} maxLength={300} disabled={locked} onChange={(e) => set({ handoff: { ...(value.handoff ?? { bridge_say: '', bridge_say_es: '', greeting: '' }), bridge_say: e.target.value } })} data-testid="agent-bridge" />
          <TextField label={c.bridgeSayEs} need="optional" value={value.handoff?.bridge_say_es ?? ''} maxLength={300} disabled={locked} onChange={(e) => set({ handoff: { ...(value.handoff ?? { bridge_say: '', bridge_say_es: '', greeting: '' }), bridge_say_es: e.target.value } })} data-testid="agent-bridge-es" />
          <TextField label={c.greeting} need="optional" hint={c.greetingHint} value={value.handoff?.greeting ?? ''} maxLength={300} disabled={locked} onChange={(e) => set({ handoff: { ...(value.handoff ?? { bridge_say: '', bridge_say_es: '', greeting: '' }), greeting: e.target.value } })} data-testid="agent-greeting" />
        </fieldset>
        <CheckboxInput label={c.archivedLabel} checked={value.archived} disabled={locked} onChange={(on) => set({ archived: on })} testId="agent-archived" />
        {saved ? (
          <ResultNotice testId="agent-result" focusKey={saved.n} tone={saved.ok ? 'info' : 'warning'}>
            {saved.ok ? adminCopy.config.saved : adminCopy.config.saveFailed}
          </ResultNotice>
        ) : null}
        {canEdit ? (
          <div className="admin-actions admin-sticky-actions">
            <Button type="submit" disabled={!dirty || save.isPending || missing.length > 0 || (creating && nameError !== null)} data-testid="agent-save">
              {save.isPending ? adminCopy.config.saving : adminCopy.config.save}
            </Button>
            {missing.length > 0 && dirty ? (
              <span className="admin-muted" data-testid="agent-missing">
                {cf.fillIn(missing.join(', '))}
              </span>
            ) : null}
          </div>
        ) : null}
      </form>
      {!creating ? (
        <details className="admin-panel admin-details" data-testid="agent-compiled" onToggle={(e) => setShowCompiled((e.target as HTMLDetailsElement).open)}>
          <summary>{c.compiled}</summary>
          <p className="admin-muted">{c.compiledHint}</p>
          {compiled.isError ? <p className="admin-muted" data-testid="agent-compiled-error">{c.compiledError}</p> : null}
          {compiled.data ? (
            <div className="admin-section">
              <h3>{c.gptLive}</h3>
              <pre className="admin-pre" data-testid="agent-compiled-prompt">{compiled.data.gpt_live_prompt}</pre>
              <h3>{c.luna}</h3>
              <pre className="admin-pre">{compiled.data.luna_rules}</pre>
              <h3>{c.realtime}</h3>
              <pre className="admin-pre">{compiled.data.realtime_prompt}</pre>
            </div>
          ) : null}
        </details>
      ) : null}
    </AdminPage>
  )
}
