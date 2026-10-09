import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import {
  ConfigProblemsError,
  useAgents,
  useLanguageCatalog,
  useLanguages,
  useSaveLanguages,
  type LanguagesCatalog,
  type Problem,
} from '../../api/config'
import { AdminPage, ResultNotice } from '../../admin/DataTable'
import { LangPhraseList, LangTextField, SET_BY_US, type LangDir } from '../../admin/LangFields'
import { adminCopy } from '../../admin/copy'
import { useUnsavedGuard } from '../../admin/useUnsavedGuard'
import { Button, ErrorState, Notice } from '../../ui'
import { handingOffAgents, itemOf, leftToFill, readDraft, type LanguageItemDraft } from './LanguagesPage'

const c = adminCopy.languages

type Result = { ok: boolean; text: string; n: number }

/** Field id for a problem path inside one language (`lines.<key>`, `handoff.<agent>`, `crisis_phrases.<i>`). */
export function fieldIdFor(code: string, rest: readonly string[]): string | null {
  const [kind, key] = rest
  if (kind === 'lines' && key) return `lang-${code}-${key}`
  if (kind === 'handoff' && key) return `lang-${code}-handoff-${key}`
  if (kind === 'crisis_phrases') return `lang-${code}-crisis`
  return null
}

function errorsFor(code: string, problems: readonly Problem[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of problems) {
    const parts = p.path.split('.')
    const at = parts[0] === code ? parts.slice(1) : parts
    const id = fieldIdFor(code, at) ?? 'page'
    out[id] = out[id] ? `${out[id]} ${p.message}` : p.message
  }
  return out
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-panel admin-section admin-lang-group">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function LockedLine({ code, dir, lineKey, label, text, help }: { code: string; dir: LangDir; lineKey: string; label: string; text: string; help?: string }) {
  return (
    <div className="ui-field admin-lang-locked" id={`lang-${code}-${lineKey}`} tabIndex={-1} data-testid={`lang-${code}-${lineKey}-locked`}>
      <p className="ui-field__label">{label}</p>
      <p className="admin-lang-locked__text" lang={code} dir={dir}>
        {text}
      </p>
      <p className="admin-muted">{SET_BY_US}</p>
      {help ? <p className="ui-field__hint">{help}</p> : null}
    </div>
  )
}

function DetailBody({ code, catalog, value }: { code: string; catalog: LanguagesCatalog; value: unknown }) {
  const lang = catalog.languages.find((l) => l.code === code)
  const agents = useAgents()
  const save = useSaveLanguages()
  const { hash } = useLocation()
  const draft = readDraft(value)
  const saved = itemOf(draft, code)
  const [edit, setEdit] = useState<LanguageItemDraft | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<Result | null>(null)
  const item = edit ?? saved
  useUnsavedGuard(edit !== null)

  // Arriving via #lang-<code>-<key>: scroll to that field and focus it.
  useEffect(() => {
    if (!hash || !lang) return
    const el = document.getElementById(decodeURIComponent(hash.slice(1)))
    if (!el) return
    el.scrollIntoView?.({ block: 'center' })
    el.focus()
  }, [hash, lang])

  if (!lang) {
    return (
      <Notice tone="warning">
        <span data-testid="language-not-found">{c.notFound}</span>{' '}
        <Link className="ui-link" to="/admin/languages">
          {c.backToList}
        </Link>
      </Notice>
    )
  }

  const dir = lang.dir
  const english = code === 'en'
  const agentList = agents.data?.agents ?? []
  const handing = handingOffAgents(agentList)
  const left = leftToFill(code, item, catalog, agentList)
  const englishLines = { ...(catalog.builtin_lines.en ?? {}), ...itemOf(draft, 'en').lines }
  const set = (patch: Partial<LanguageItemDraft>) => setEdit({ ...item, ...patch })
  const allErrors = errors

  const onSave = () => {
    const next = { ...draft, items: { ...draft.items, [code]: item } }
    save.mutate(next, {
      onSuccess: () => {
        setEdit(null)
        setErrors({})
        setResult((p) => ({ ok: true, text: c.saved, n: (p?.n ?? 0) + 1 }))
      },
      onError: (e) => {
        if (e instanceof ConfigProblemsError) setErrors(errorsFor(code, e.problems))
        setResult((p) => ({ ok: false, text: e instanceof ConfigProblemsError ? c.fixFields : c.saveFailed, n: (p?.n ?? 0) + 1 }))
      },
    })
  }

  const lineFields = (group: 'speech' | 'screen') =>
    catalog.line_keys
      .filter((k) => k.group === group)
      .map((k) => {
        const ours = catalog.builtin_lines[code]?.[k.key]
        if (k.builtin && ours) {
          return <LockedLine key={k.key} code={code} dir={dir} lineKey={k.key} label={k.label} text={ours} help={k.help} />
        }
        return (
          <LangTextField
            key={k.key}
            code={code}
            dir={dir}
            lineKey={k.key}
            label={k.label}
            help={k.help}
            english={english ? undefined : englishLines[k.key]}
            value={item.lines[k.key] ?? ''}
            onChange={(v) => set({ lines: { ...item.lines, [k.key]: v } })}
            error={allErrors[`lang-${code}-${k.key}`]}
          />
        )
      })

  return (
    <div className="admin-lang-detail" data-testid={`language-${code}`}>
      <h2 className="admin-lang-detail__name">
        {lang.name}{' '}
        <span className="admin-muted" lang={code} dir={dir}>
          {lang.native}
        </span>
      </h2>
      {!item.enabled ? (
        <Notice tone="info">
          <span data-testid="language-off">{c.offNote}</span>
        </Notice>
      ) : left === 0 ? (
        <Notice tone="info">
          <span data-testid="language-ready">{c.readyNote}</span>
        </Notice>
      ) : (
        <p className="admin-muted" aria-live="polite" data-testid="language-left">
          {c.left(left)}
        </p>
      )}
      {allErrors.page ? (
        <p className="ui-field__error" role="alert">
          {allErrors.page}
        </p>
      ) : null}
      <Group title={c.groups.speech}>{lineFields('speech')}</Group>
      <Group title={c.groups.handoff}>
        {handing.length === 0 ? <p className="admin-muted">{c.noHandoff}</p> : null}
        {english ? (
          <>
            {handing.length ? <p className="admin-muted">{c.handoffEnglish}</p> : null}
            <ul className="admin-lang-handoff-links">
              {handing.map((a) => (
                <li key={a.name}>
                  <Link className="ui-link" to={`/admin/agents/${a.name}`} data-testid={`lang-en-handoff-${a.name}`}>
                    {a.title}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          handing.map((a) => (
            <LangTextField
              key={a.name}
              code={code}
              dir={dir}
              lineKey={`handoff-${a.name}`}
              label={a.title}
              help={c.handoffHelp(a.title)}
              value={item.handoff[a.name] ?? ''}
              onChange={(v) => set({ handoff: { ...item.handoff, [a.name]: v } })}
              error={allErrors[`lang-${code}-handoff-${a.name}`]}
            />
          ))
        )}
      </Group>
      <Group title={c.groups.crisis}>
        <div id={`lang-${code}-crisis`} tabIndex={-1}>
          <LangPhraseList
            code={code}
            dir={dir}
            languageName={lang.name}
            label={c.crisisLabel}
            hint={catalog.crisis_floor[code]?.length ? c.crisisHintFloor : c.crisisHint}
            floor={catalog.crisis_floor[code] ?? []}
            additions={item.crisis_phrases}
            onChange={(next) => set({ crisis_phrases: next })}
            enabled={item.enabled}
            testId={`lang-${code}-crisis-list`}
          />
          {allErrors[`lang-${code}-crisis`] ? (
            <p className="ui-field__error" role="alert">
              {allErrors[`lang-${code}-crisis`]}
            </p>
          ) : null}
        </div>
      </Group>
      <Group title={c.groups.screen}>{lineFields('screen')}</Group>
      <div className="admin-actions">
        <Button onClick={onSave} disabled={save.isPending || edit === null} data-testid="language-save">
          {save.isPending ? c.saving : c.save}
        </Button>
        {edit !== null ? (
          <Button variant="secondary" onClick={() => setEdit(null)} disabled={save.isPending} data-testid="language-cancel">
            {c.cancel}
          </Button>
        ) : null}
      </div>
      {result ? (
        <ResultNotice testId="language-result" focusKey={result.n} tone={result.ok ? 'info' : 'warning'}>
          {result.text}
        </ResultNotice>
      ) : null}
    </div>
  )
}

/** Admin-only: everything one language says to callers and shows on their screen, in one save. */
export function LanguageDetailPage() {
  const { code = '' } = useParams()
  const catalog = useLanguageCatalog()
  const languages = useLanguages()

  let body
  if (catalog.isPending || languages.isPending) {
    body = (
      <div className="admin-panel admin-section" aria-busy="true" data-testid="language-loading">
        <span className="admin-sr-only">{c.loading}</span>
        <span className="admin-skeleton admin-lang-row__skeleton" />
        <span className="admin-skeleton admin-lang-row__skeleton" />
        <span className="admin-skeleton admin-lang-row__skeleton" />
      </div>
    )
  } else if (!catalog.data || !languages.data) {
    body = (
      <ErrorState
        message={c.loadError}
        onRetry={() => {
          void catalog.refetch()
          void languages.refetch()
        }}
        data-testid="language-error"
      />
    )
  } else {
    body = <DetailBody key={code} code={code} catalog={catalog.data} value={languages.data.value} />
  }
  return <AdminPage page="language-detail">{body}</AdminPage>
}
