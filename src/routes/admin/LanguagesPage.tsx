import { useState } from 'react'
import { Link } from 'react-router'
import {
  ConfigProblemsError,
  useAgents,
  useLanguageCatalog,
  useLanguages,
  useSaveLanguages,
  type AgentSummary,
  type LanguagesCatalog,
} from '../../api/config'
import { AdminPage } from '../../admin/DataTable'
import { adminCopy } from '../../admin/copy'
import { ErrorState } from '../../ui'

const c = adminCopy.languages

export interface LanguageItemDraft {
  enabled: boolean
  lines: Record<string, string>
  handoff: Record<string, string>
  crisis_phrases: string[]
}

export interface LanguagesDraft {
  default: string
  items: Record<string, LanguageItemDraft>
}

/** Languages that need at least this many own crisis phrases when there is no floor set by us. */
export const MIN_CRISIS_PHRASES = 3

const blank = (x: string | null | undefined) => !x || !x.trim()

/** The draft value with every field present. */
export function readDraft(value: unknown): LanguagesDraft {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<LanguagesDraft>
  return { default: v.default ?? 'en', items: { ...(v.items ?? {}) } }
}

/** One language's draft, empty when it was never set. English is always on. */
export function itemOf(draft: LanguagesDraft, code: string): LanguageItemDraft {
  const it = draft.items[code]
  return {
    enabled: code === 'en' || Boolean(it?.enabled),
    lines: { ...(it?.lines ?? {}) },
    handoff: { ...(it?.handoff ?? {}) },
    crisis_phrases: [...(it?.crisis_phrases ?? [])],
  }
}

/** Agents that hand callers on: the server lists their other-language lines (empty without a
 * handoff). */
export function handingOffAgents(agents: readonly AgentSummary[]): AgentSummary[] {
  return agents.filter((a) => !a.archived && a.other_languages.length > 0)
}

/** Lines still missing: required lines without admin text or a line set by us, handoff lines of
 * agents that hand off (not English), and too few crisis phrases where we set none. */
export function leftToFill(
  code: string,
  item: LanguageItemDraft,
  catalog: LanguagesCatalog,
  agents: readonly AgentSummary[],
): number {
  let n = 0
  for (const k of catalog.line_keys) {
    if (blank(item.lines[k.key]) && blank(catalog.builtin_lines[code]?.[k.key])) n += 1
  }
  if (code !== 'en') {
    for (const a of handingOffAgents(agents)) if (blank(item.handoff[a.name])) n += 1
  }
  if (!catalog.crisis_floor[code]?.length && item.crisis_phrases.filter((p) => !blank(p)).length < MIN_CRISIS_PHRASES) n += 1
  return n
}

function SkeletonRows() {
  return (
    <ul className="admin-lang-list" aria-busy="true" data-testid="languages-loading">
      <span className="admin-sr-only">{c.loading}</span>
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="admin-lang-row">
          <span className="admin-skeleton admin-lang-row__skeleton" />
        </li>
      ))}
    </ul>
  )
}

/** Admin-only: every language callers may speak, whether it is on, and what is left to fill in. */
export function LanguagesPage() {
  const catalog = useLanguageCatalog()
  const languages = useLanguages()
  const agents = useAgents()
  const save = useSaveLanguages()
  const [busy, setBusy] = useState<string | null>(null)
  // Optimistic switch position while a save is in flight; cleared when it settles.
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  let body
  if (catalog.isPending || languages.isPending) {
    body = <SkeletonRows />
  } else if (!catalog.data || !languages.data) {
    body = (
      <ErrorState
        message={c.loadError}
        onRetry={() => {
          void catalog.refetch()
          void languages.refetch()
        }}
        data-testid="languages-error"
      />
    )
  } else {
    const cat = catalog.data
    const draft = readDraft(languages.data.value)
    const agentList = agents.data?.agents ?? []

    const toggle = (code: string, on: boolean) => {
      const next: LanguagesDraft = { ...draft, items: { ...draft.items, [code]: { ...itemOf(draft, code), enabled: on } } }
      setBusy(code)
      setPending((p) => ({ ...p, [code]: on }))
      setErrors((e) => ({ ...e, [code]: '' }))
      save.mutate(next, {
        onSettled: () => {
          setBusy(null)
          setPending((p) => {
            const rest = { ...p }
            delete rest[code]
            return rest
          })
        },
        onError: (e) => {
          const msg = e instanceof ConfigProblemsError && e.problems.length ? e.problems.map((p) => p.message).join(' ') : c.switchFailed
          setErrors((x) => ({ ...x, [code]: msg }))
        },
      })
    }

    body = (
      <ul className="admin-lang-list" data-testid="languages-list">
        {cat.languages.map((lang) => {
          const item = itemOf(draft, lang.code)
          const english = lang.code === 'en'
          const on = english || (pending[lang.code] ?? item.enabled)
          const left = leftToFill(lang.code, item, cat, agentList)
          const status = !on ? c.off : left > 0 ? c.left(left) : c.ready
          const switchId = `lang-switch-${lang.code}`
          return (
            <li key={lang.code} className="admin-lang-row" data-testid={`lang-row-${lang.code}`}>
              <div className="admin-lang-row__name">
                <strong>{lang.name}</strong>
                <span className="admin-muted" lang={lang.code} dir={lang.dir}>
                  {lang.native}
                </span>
              </div>
              <p className="admin-lang-row__status" aria-live="polite" data-testid={`lang-status-${lang.code}`}>
                {status}
              </p>
              <Link className="ui-link admin-lang-row__fill" to={`/admin/languages/${lang.code}`} data-testid={`lang-fill-${lang.code}`}>
                {c.fillIn}
                <span className="admin-sr-only"> {lang.name}</span>
              </Link>
              <div className="admin-switch">
                <input
                  id={switchId}
                  type="checkbox"
                  role="switch"
                  className="admin-switch__input"
                  checked={on}
                  aria-disabled={english || busy !== null ? true : undefined}
                  aria-busy={busy === lang.code || undefined}
                  onChange={(e) => {
                    if (english || busy !== null) return
                    toggle(lang.code, e.target.checked)
                  }}
                  data-testid={switchId}
                />
                <label htmlFor={switchId} className="admin-switch__label">
                  {c.useOnCalls(lang.name)}
                </label>
                {english ? (
                  <span className="admin-muted" data-testid="lang-always-on">
                    {c.alwaysOn}
                  </span>
                ) : null}
                {busy === lang.code ? (
                  <span className="admin-muted" data-testid={`lang-saving-${lang.code}`}>
                    {c.saving}
                  </span>
                ) : null}
              </div>
              {errors[lang.code] ? (
                <p className="ui-field__error admin-lang-row__error" role="alert" data-testid={`lang-error-${lang.code}`}>
                  {errors[lang.code]}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    )
  }

  return <AdminPage page="languages">{body}</AdminPage>
}
