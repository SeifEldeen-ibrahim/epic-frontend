import type { Problem } from '../api/config'
import { adminCopy } from './copy'
import type { FieldDef, Rec } from './EditDialog'

const f = adminCopy.fields

/** A key made from a name: lowercase letters, numbers and `_`, starting with a letter. */
export function slugify(text: string, max = 40): string {
  const s = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .slice(0, max)
    .replace(/_+$/, '')
  return s
}

/** True for an empty value: blank text, null/undefined or an empty list. */
export function isBlank(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

/** Short label for messages: "Note (where this info came from)" → "Note". */
export function shortLabel(label: string): string {
  return label.split(' (')[0]
}

/** Labels of the required fields that are still empty. */
export function missingRequired(
  fields: readonly { key: string; label: string; required?: boolean }[],
  value: Record<string, unknown>,
): string[] {
  return fields.filter((x) => x.required && isBlank(value[x.key])).map((x) => shortLabel(x.label))
}

/** The server's message ("missing", "string_too_long", "value_error (…)") in plain words. */
export function plainMessage(message: string): string {
  const [type, ...rest] = message.split(' (')
  const words = f.words[type.trim()]
  if (!words) return message
  const detail = rest.length && type.trim() === 'value_error' ? ` (${rest.join(' (')}` : ''
  return `${words}${detail}`
}

function humanKey(key: string): string {
  const t = key.replace(/_/g, ' ').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : key
}

export interface DescribeOptions {
  /** The list that holds rows (e.g. "services"): its second path segment names the row. */
  list?: string
  /** Row name for a path segment (an index like "0" or a key like "flu_shot"). */
  rowLabel?: (segment: string) => string | undefined
  /** Field label for a field key. */
  fieldLabel?: (key: string) => string | undefined
}

/** One problem in plain words, e.g. "Row 2 (flu_shot): Note is missing". */
export function describeProblem(p: Problem, opts: DescribeOptions = {}): string {
  const words = plainMessage(p.message)
  if (!p.path || p.path === '<root>') return `${f.wholeSection} ${words}`
  const parts = p.path.split('.')
  let row: string | undefined
  let fieldParts = parts
  if (opts.list && parts[0] === opts.list && parts.length >= 2) {
    row = opts.rowLabel?.(parts[1]) ?? parts[1]
    fieldParts = parts.slice(2)
  }
  const fieldKey = fieldParts.filter((x) => !/^\d+$/.test(x)).join('.')
  const last = fieldParts.length ? fieldParts[fieldParts.length - 1] : ''
  const label = fieldParts.length
    ? shortLabel(opts.fieldLabel?.(fieldKey) ?? opts.fieldLabel?.(fieldParts[0]) ?? humanKey(/^\d+$/.test(last) ? fieldParts[0] : last))
    : ''
  const text = label ? `${label} ${words}` : words
  return row ? `${row}: ${text}` : text
}

/** Problems for one row of a list, keyed by the row's field: `{ source: "is missing" }`. */
export function rowFieldErrors(
  problems: readonly Problem[],
  list: string,
  rowIds: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of problems) {
    const parts = p.path.split('.')
    if (parts[0] !== list || parts.length < 3 || !rowIds.includes(parts[1])) continue
    const key = parts[2]
    if (!out[key]) out[key] = plainMessage(p.message)
  }
  return out
}

/** Problems keyed by their first path segment (a top-level field), in plain words. */
export function fieldErrors(problems: readonly Problem[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of problems) {
    const key = p.path.split('.')[0]
    if (key && key !== '<root>' && !out[key]) out[key] = plainMessage(p.message)
  }
  return out
}

/** The empty value of a field kind: what a new record starts with. */
export function emptyFor(kind: FieldDef['kind']): unknown {
  if (kind === 'list') return []
  if (kind === 'checkbox') return false
  if (kind === 'select' || kind === 'number') return null
  return ''
}

/** A new record: every declared field present with its empty value, then `initial`. */
export function blankRecord(fields: readonly FieldDef[], initial: Rec = {}): Rec {
  const out: Rec = {}
  for (const f of fields) out[f.key] = emptyFor(f.kind)
  return { ...out, ...initial }
}
