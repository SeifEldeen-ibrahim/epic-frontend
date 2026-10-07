import { useId, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  ConfigProblemsError,
  isStale,
  KNOWLEDGE_SECTIONS,
  useConfigState,
  useDiscardDraft,
  useDraftDiff,
  useLoadDefaults,
  usePublish,
  type ConfigState,
  type KnowledgeSection as Section,
} from '../../api/config'
import { ConfirmDialog } from '../../admin/ConfirmDialog'
import { AdminPage, ResultNotice } from '../../admin/DataTable'
import { DiffView } from '../../admin/DiffView'
import { adminCopy } from '../../admin/copy'
import { Button, ErrorState, Notice, TextField } from '../../ui'
import { KnowledgeSection } from './KnowledgeSection'

const c = adminCopy.config

type Pending = 'publish' | 'discard' | 'defaults' | null
type Result = { ok: boolean; text: string; n: number }

/** The draft/live bar every config page shows: state, problems, publish, discard, defaults. */
export function ConfigBar({ state }: { state: ConfigState }) {
  const publish = usePublish()
  const discard = useDiscardDraft()
  const defaults = useLoadDefaults()
  const [pending, setPending] = useState<Pending>(null)
  const [note, setNote] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const diff = useDraftDiff(showDiff)
  const busy = publish.isPending || discard.isPending || defaults.isPending
  const changed = state.draft_changed_sections.length
  const problems = state.draft_problems
  const say = (ok: boolean, text: string) => setResult((p) => ({ ok, text, n: (p?.n ?? 0) + 1 }))

  const onConfirm = () => {
    if (pending === 'publish') {
      publish.mutate(
        { based_on_seq: state.draft_based_on_seq, note: note.trim() || null },
        {
          onSuccess: (r) => {
            setPending(null)
            setNote('')
            say(true, c.published(r.live_label))
          },
          onError: (e) => {
            setPending(null)
            say(false, isStale(e) ? c.stale : e instanceof ConfigProblemsError ? c.publishFailed : c.saveFailed)
          },
        },
      )
    } else if (pending === 'discard') {
      discard.mutate(undefined, { onSettled: () => setPending(null) })
    } else if (pending === 'defaults') {
      defaults.mutate(undefined, { onSettled: () => setPending(null) })
    }
  }

  return (
    <div className="admin-panel admin-section admin-configbar" data-testid="config-bar">
      <div className="admin-configbar__facts">
        <p>
          <span className="admin-muted">{c.live}: </span>
          <code data-testid="config-live-label">{state.active_label}</code>
        </p>
        <p>
          <span className="admin-muted">{c.entryAgent}: </span>
          <strong data-testid="config-entry">{state.entry_agent}</strong>
        </p>
        <p data-testid="config-draft-state">
          {changed === 0 ? c.noChanges : c.changed(changed)} {problems.length ? c.problems(problems.length) : ''}
        </p>
      </div>
      {!state.can_edit ? <Notice tone="info">{c.readOnly}</Notice> : null}
      {state.fallback_problems ? (
        <Notice tone="warning">
          <span data-testid="config-fallback">{c.fallback}</span>
        </Notice>
      ) : null}
      {state.reload_pending ? (
        <Notice tone="warning">
          <span data-testid="config-reload-pending">{c.reloadPending}</span>
        </Notice>
      ) : null}
      {state.stale ? (
        <Notice tone="warning">
          <span data-testid="config-stale">{c.stale}</span>
        </Notice>
      ) : null}
      {state.drift ? (
        <Notice tone="info">
          <span data-testid="config-drift">{c.drift}</span>
        </Notice>
      ) : null}
      {problems.length ? (
        <details className="admin-details" data-testid="config-problems" open>
          <summary>{c.problemsTitle}</summary>
          <ul className="admin-problems">
            {problems.map((p, i) => (
              <li key={i}>
                <code>{p.document}</code> {p.path !== '<root>' ? <code>{p.path}</code> : null}: {p.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="admin-configbar__notice">
        {result ? (
          <ResultNotice testId="config-result" focusKey={result.n} tone={result.ok ? 'info' : 'warning'}>
            {result.text}
          </ResultNotice>
        ) : null}
      </div>
      <div className="admin-actions">
        {state.can_edit ? (
          <>
            <Button
              onClick={() => setPending('publish')}
              disabled={busy || changed === 0 || problems.length > 0 || state.stale}
              data-testid="config-publish"
            >
              {publish.isPending ? c.publishing : c.publish}
            </Button>
            <Button variant="secondary" onClick={() => setPending('discard')} disabled={busy || changed === 0} data-testid="config-discard">
              {c.discard}
            </Button>
            {state.drift ? (
              <Button variant="secondary" onClick={() => setPending('defaults')} disabled={busy} data-testid="config-defaults">
                {c.loadDefaults}
              </Button>
            ) : null}
          </>
        ) : null}
        {changed > 0 ? (
          <Button variant="secondary" onClick={() => setShowDiff((v) => !v)} aria-expanded={showDiff} data-testid="config-show-diff">
            {showDiff ? c.hideChanges : c.viewChanges}
          </Button>
        ) : null}
      </div>
      {showDiff && diff.data
        ? diff.data.sections.map((s) => (
            <div key={s.section} className="admin-section">
              <h3>{s.section}</h3>
              <DiffView diff={s.diff} testId={`config-diff-${s.section}`} />
            </div>
          ))
        : null}
      <ConfirmDialog
        open={pending !== null}
        title={pending === 'publish' ? c.publishTitle : pending === 'discard' ? c.discardTitle : c.loadDefaultsTitle}
        confirmLabel={pending === 'publish' ? c.publishConfirm : pending === 'discard' ? c.discardConfirm : c.loadDefaultsConfirm}
        cancelLabel={c.cancel}
        busy={busy}
        onConfirm={onConfirm}
        onCancel={() => setPending(null)}
        testId="config-confirm"
      >
        <p>{pending === 'publish' ? c.publishBody : pending === 'discard' ? c.discardBody : c.loadDefaultsBody}</p>
        {pending === 'publish' ? (
          <>
            <p className="admin-muted">{state.draft_changed_sections.join(', ')}</p>
            <TextField label={c.publishNote} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} data-testid="config-publish-note" />
          </>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}

/** The bar with its own loading and error states, for pages that show it on top. */
export function ConfigStateBar() {
  const q = useConfigState()
  if (q.isPending) {
    return (
      <div className="admin-panel admin-section" aria-busy="true" data-testid="config-bar-loading">
        <span className="admin-sr-only">{c.loading}</span>
        <span className="admin-skeleton" />
        <span className="admin-skeleton" />
      </div>
    )
  }
  if (!q.data) return <ErrorState message={c.error} onRetry={() => void q.refetch()} data-testid="config-bar-error" />
  return <ConfigBar state={q.data} />
}

/** /admin/knowledge: the switchboard's knowledge base, section by section. */
export function KnowledgePage() {
  const q = useConfigState()
  const [params, setParams] = useSearchParams()
  const tabsId = useId()
  const raw = params.get('section')
  const section: Section = (KNOWLEDGE_SECTIONS as readonly string[]).includes(raw ?? '') ? (raw as Section) : 'routing'
  const select = (s: Section) => setParams({ section: s }, { replace: true })

  return (
    <AdminPage page="knowledge">
      <ConfigStateBar />
      <div className="admin-tabs" role="tablist" aria-label={adminCopy.pages.knowledge} id={tabsId} data-testid="knowledge-tabs">
        {KNOWLEDGE_SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={s === section}
            className="admin-tab"
            onClick={() => select(s)}
            data-testid={`knowledge-tab-${s}`}
          >
            {c.sections[s]}
          </button>
        ))}
      </div>
      <div className="admin-tabs-select">
        <label className="ui-field__label" htmlFor={`${tabsId}-select`}>
          {adminCopy.pages.knowledge}
        </label>
        <select id={`${tabsId}-select`} className="ui-input" value={section} onChange={(e) => select(e.target.value as Section)} data-testid="knowledge-section-select">
          {KNOWLEDGE_SECTIONS.map((s) => (
            <option key={s} value={s}>
              {c.sections[s]}
            </option>
          ))}
        </select>
      </div>
      <div role="tabpanel" className="admin-section" aria-label={c.sections[section]}>
        <h2>{c.sections[section]}</h2>
        <KnowledgeSection key={section} section={section} canEdit={q.data?.can_edit ?? false} problems={q.data?.draft_problems ?? []} />
      </div>
    </AdminPage>
  )
}
