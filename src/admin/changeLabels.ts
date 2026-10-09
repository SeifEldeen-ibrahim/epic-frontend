import { useCatalog, type ChangeItem, type ChangeNames, type ChangeSummaryItem, type KnowledgeSection, type VersionItem } from '../api/config'
import { sectionLabels, wordingLabel } from '../routes/admin/KnowledgeSection'
import { adminCopy, formatTime, label as humanize } from './copy'
import { shortLabel } from './problems'

const v = adminCopy.versions
const a = adminCopy.agents
const f = adminCopy.forms
const cfg = adminCopy.config

type Area = ChangeItem['area']
type Kind = ChangeItem['kind']

/** One readable line of a change: "Label: before → after", or one side for added/removed. */
export interface ChangeLine {
  key: string
  label: string
  kind: Kind
  before: string | null
  after: string | null
  /** Word-list changes: "Added: a, b" / "Removed: c" instead of before/after. */
  listAdded?: string[]
  listRemoved?: string[]
  /** Long text: shown as stacked Before / After blocks. */
  long: boolean
}

export interface ChangeItemGroup {
  key: string
  title: string
  kind: Kind | 'section'
  lines: ChangeLine[]
}

export interface ChangeGroup {
  area: Area
  title: string
  items: ChangeItemGroup[]
}

export interface LabelContext {
  names: ChangeNames
  /** Tool id → its plain description (from the catalog); unknown ids are humanised. */
  tools: Record<string, string>
}

const AREA_ORDER: Area[] = ['answering', 'knowledge', 'departments', 'forms', 'agents']
const LONG = 120
/** Item keys that are ids (never shown as fields: they appear only under Advanced). */
const ID_KEYS: Record<string, string> = { routing: 'role', services: 'key', referrals: 'key', agents: 'name', forms: 'name' }

const AGENT_LABELS: Record<string, string> = {
  title: a.title,
  persona: a.persona,
  voice: a.voice,
  knowledge: a.knowledge,
  tools: a.tools,
  route_targets: v.routeTargets,
  form: a.formPick,
  handoff: a.handoff,
  'handoff.bridge_say': a.bridgeSay,
  'handoff.greeting': a.greeting,
  archived: shortLabel(a.archivedLabel),
}

const FORM_LABELS: Record<string, string> = {
  title: f.title,
  fields: f.fields,
  archived: shortLabel(f.archivedLabel),
  never_collect: shortLabel(f.neverCollect),
  status: cfg.status,
  source: adminCopy.fields.note,
}

const FIELD_PROP_LABELS: Record<string, string> = {
  label: f.label,
  type: f.type,
  required: f.required,
  help: shortLabel(f.help),
  readback_label: f.readback,
  values: f.values,
  stop_values: f.stopValues.split(':')[0],
  max_length: f.maxLength,
  max_items: f.maxItems,
  minimum: f.minimum,
  maximum: f.maximum,
}

/** An editor label without its hint in brackets, keeping any language name ("(Arabic)") and case variants. */
export function plainLabel(text: string): string {
  return /\(([A-Z][\p{L}\p{M} -]*|exact case)\)$/u.test(text) ? text : shortLabel(text)
}
const plain = plainLabel

/** A language page line named with its language: "Closed now (Arabic)". */
export function languageLabel(label: string, languageName: string): string {
  return `${shortLabel(label)} (${languageName})`
}

function knowledgeLabels(section: string): Record<string, string> {
  const out = sectionLabels(section as KnowledgeSection)
  const short: Record<string, string> = {}
  for (const [k, text] of Object.entries(out)) short[k] = plain(text)
  return short
}

/** Plain label for a field path inside an item or section; `fallback` names an unknown key. */
export function fieldLabel(
  area: Area,
  section: string | null,
  path: readonly string[],
  fallback: (key: string) => string = humanize,
): string {
  if (path.length === 0) return ''
  const joined = path.join('.')
  if (area === 'agents') return AGENT_LABELS[joined] ?? path.map((p) => AGENT_LABELS[p] ?? fallback(p)).join(' › ')
  if (area === 'forms') {
    if (path[0] === 'fields' && path.length >= 2) {
      const name = v.formField(humanize(path[1]))
      if (path.length === 2) return name
      return [name, ...path.slice(2).map((p) => FIELD_PROP_LABELS[p] ?? fallback(p))].join(' › ')
    }
    return FORM_LABELS[joined] ?? path.map((p) => FORM_LABELS[p] ?? fallback(p)).join(' › ')
  }
  if (area === 'answering') return v.areas.answering
  const labels = section ? knowledgeLabels(section) : {}
  if (labels[joined]) return labels[joined]
  return path
    .map((p) => (section === 'wording' ? plain(wordingLabel(p)) : (labels[p] ?? fallback(p))))
    .join(' › ')
}

function isEmpty(x: unknown): boolean {
  return x === null || x === undefined || x === '' || (Array.isArray(x) && x.length === 0)
}

function isStringList(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((i) => typeof i === 'string')
}

/** A value as plain text, with references shown by their titles. */
export function formatValue(area: Area, section: string | null, path: readonly string[], value: unknown, ctx: LabelContext): string {
  const last = path[path.length - 1]
  if (area === 'answering') return isEmpty(value) ? v.nothing : (ctx.names.agents[String(value)] ?? String(value))
  if (section === 'routing' && last === 'handled_by') {
    return isEmpty(value) ? v.deptMessage : v.agentRef(ctx.names.agents[String(value)] ?? String(value))
  }
  if (section === 'hours' && path[0] === 'weekly' && path.length === 2) {
    return Array.isArray(value) && value.length === 2 ? `${String(value[0])}–${String(value[1])}` : v.closed
  }
  if (isEmpty(value)) return v.nothing
  if (typeof value === 'boolean') return value ? v.yes : v.no
  if (typeof value === 'number') return String(value)
  if (last === 'status' && typeof value === 'string') {
    return cfg.statusOptions.find((o) => o.value === value)?.label ?? value
  }
  if (area === 'agents' && last === 'form') return ctx.names.forms[String(value)] ?? String(value)
  if (area === 'agents' && last === 'tools' && isStringList(value)) return value.map((t) => ctx.tools[t] ?? humanize(t)).join(', ')
  if (area === 'agents' && last === 'route_targets' && isStringList(value)) {
    return value.map((t) => ctx.names.departments[t] ?? ctx.names.agents[t] ?? humanize(t)).join(', ')
  }
  if (typeof value === 'string') return value
  if (isStringList(value)) return value.join(', ')
  if (Array.isArray(value)) {
    return value
      .map((x) => (x && typeof x === 'object' ? Object.values(x as Record<string, unknown>).filter((y) => !isEmpty(y)).map(String).join(' — ') : String(x)))
      .join('\n')
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, y]) => !isEmpty(y))
      .map(([k, y]) => `${fieldLabel(area, section, [...path, k]).split(' › ').pop()}: ${formatValue(area, section, [...path, k], y, ctx)}`)
      .join('\n')
  }
  return String(value)
}

/** The list items a word list gained or lost (shown by title). */
function listDelta(area: Area, section: string | null, path: readonly string[], before: string[], after: string[], ctx: LabelContext) {
  const show = (xs: string[]) => xs.map((x) => formatValue(area, section, path, [x], ctx))
  return { added: show(after.filter((x) => !before.includes(x))), removed: show(before.filter((x) => !after.includes(x))) }
}

function line(c: ChangeItem, path: string[], kind: Kind, before: unknown, after: unknown, ctx: LabelContext): ChangeLine {
  let labelText = c.area === 'answering' ? v.answeringLine : fieldLabel(c.area, c.section, path)
  const spec = (after ?? before) as { label?: unknown } | null
  if (c.area === 'forms' && path.length === 2 && path[0] === 'fields' && spec && typeof spec.label === 'string' && spec.label) {
    labelText = v.formField(spec.label)
  }
  const out: ChangeLine = {
    key: [c.area, c.section, c.item, ...path].join('/'),
    label: labelText,
    kind,
    before: kind === 'added' ? null : formatValue(c.area, c.section, path, before, ctx),
    after: kind === 'removed' ? null : formatValue(c.area, c.section, path, after, ctx),
    long: false,
  }
  const handledBy = c.section === 'routing' && path[path.length - 1] === 'handled_by'
  if (kind === 'changed' && isStringList(before) && isStringList(after) && !handledBy) {
    const d = listDelta(c.area, c.section, path, before, after, ctx)
    out.listAdded = d.added
    out.listRemoved = d.removed
  }
  out.long = [out.before, out.after].some((t) => t !== null && (t.length > LONG || t.includes('\n')))
  return out
}

/** A whole added/removed item as one line per filled-in field (ids left out). */
function itemLines(c: ChangeItem, ctx: LabelContext): ChangeLine[] {
  const value = (c.kind === 'added' ? c.after : c.before) as Record<string, unknown> | null
  if (!value || typeof value !== 'object') return []
  const idKey = ID_KEYS[c.section ?? c.area]
  return Object.entries(value)
    .filter(([k, x]) => k !== idKey && !isEmpty(x))
    .map(([k, x]) => line(c, [k], c.kind, c.kind === 'removed' ? x : null, c.kind === 'added' ? x : null, ctx))
}

function itemTitle(c: ChangeItem): string {
  const name = c.item_title ?? (c.item && !c.item.startsWith('#') ? humanize(c.item) : '')
  if (c.area === 'answering') return v.areas.answering
  if (c.area === 'knowledge') {
    const section = cfg.sections[c.section ?? ''] ?? humanize(c.section)
    return c.item ? `${section} › ${name}` : section
  }
  if (c.area === 'departments') return c.item ? name : cfg.sections.routing
  return name
}

/** Changes grouped by page (menu order) and item, each as readable lines. */
export function groupChanges(changes: readonly ChangeItem[], ctx: LabelContext): ChangeGroup[] {
  const groups = new Map<Area, ChangeGroup>()
  const items = new Map<string, ChangeItemGroup>()
  for (const c of changes) {
    let g = groups.get(c.area)
    if (!g) {
      g = { area: c.area, title: v.areas[c.area] ?? humanize(c.area), items: [] }
      groups.set(c.area, g)
    }
    const key = [c.area, c.section, c.item].join('/')
    let it = items.get(key)
    if (!it) {
      const whole = c.item !== null && c.field.length === 0
      it = { key, title: itemTitle(c), kind: whole ? c.kind : c.item ? 'changed' : 'section', lines: [] }
      items.set(key, it)
      g.items.push(it)
    }
    if (c.item !== null && c.field.length === 0) it.lines.push(...itemLines(c, ctx))
    else it.lines.push(line(c, c.field, c.kind, c.before, c.after, ctx))
  }
  return AREA_ORDER.filter((x) => groups.has(x)).map((x) => groups.get(x) as ChangeGroup)
}

/** "3 services added, 1 department changed, Agent Receptionist changed". */
export function summarize(summary: readonly ChangeSummaryItem[]): string {
  const parts = summary.map((s) => {
    const verb = v.verbs[s.kind] ?? s.kind
    if (s.area === 'answering') return v.sectionChanged(v.areas.answering)
    const nounKey = s.area === 'knowledge' || s.area === 'departments' ? (s.section ?? '') : s.area
    const noun = v.nouns[nounKey]
    if (!noun) return v.sectionChanged(cfg.sections[s.section ?? ''] ?? humanize(s.section))
    if (s.count === 1 && s.titles[0]) return `${noun[0]} ${s.titles[0]} ${verb}`
    return `${s.count} ${s.count === 1 ? noun[0] : noun[1]} ${verb}`
  })
  if (parts.length === 0) return v.noSummary
  const text = parts.join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** A version's heading: who made it live and when, in plain words. */
export function versionHeading(item: VersionItem, all: readonly VersionItem[]): string {
  const when = formatTime(item.created_at)
  if (item.source === 'seed') return v.startingSetup(when)
  if (item.source === 'rollback' && item.rolled_back_from) {
    const to = all.find((x) => x.seq === item.rolled_back_from)
    if (to) return v.wentBack(when, formatTime(to.created_at))
  }
  return v.madeLive(when, item.created_by ?? '')
}

/** Tool id → plain description (from the catalog), for change lists. */
export function useToolNames(): Record<string, string> {
  const catalog = useCatalog()
  const out: Record<string, string> = {}
  for (const t of catalog.data?.tools ?? []) out[t.name] = t.description
  return out
}
