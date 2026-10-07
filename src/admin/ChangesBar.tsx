import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useSession } from '../api/auth'
import {
  ConfigProblemsError,
  isStale,
  useConfigState,
  useDiscardDraft,
  useLoadDefaults,
  usePublish,
  type ConfigState,
  type Problem,
} from '../api/config'
import { Button, Notice, TextField } from '../ui'
import { ConfirmDialog } from './ConfirmDialog'
import { ResultNotice } from './DataTable'
import { adminCopy } from './copy'
import { useHasUnsavedEdits } from './useUnsavedGuard'

const c = adminCopy.changes
const sections = adminCopy.config.sections

/** Setup pages: the changes bar shows only here. */
const SETUP_PATHS = ['/admin/knowledge', '/admin/departments', '/admin/forms', '/admin/agents', '/admin/versions']

function isSetupPath(pathname: string): boolean {
  return SETUP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** Where a problem is fixed, in the admin's words, with a link. */
function placeOf(document: string): { name: string; to: string } {
  if (document === 'knowledge.routing') return { name: sections.routing, to: '/admin/departments' }
  if (document.startsWith('knowledge.')) {
    const key = document.slice('knowledge.'.length)
    return { name: sections[key] ?? adminCopy.pages.knowledge, to: `/admin/knowledge?section=${key}` }
  }
  if (document === 'entry_agent') return { name: c.places.entry_agent, to: '/admin/agents' }
  const [kind, name] = document.split('.', 2)
  if (kind === 'agents' && name) return { name: `${c.places.agents} › ${name}`, to: `/admin/agents/${name}` }
  if (kind === 'forms' && name) return { name: `${c.places.forms} › ${name}`, to: `/admin/forms/${name}` }
  return { name: document, to: '/admin' }
}

function changedPlaces(state: ConfigState): string {
  const names = state.draft_changed_sections.map((s) => {
    if (s.startsWith('knowledge.')) return sections[s.slice('knowledge.'.length)] ?? s
    return c.places[s] ?? s
  })
  return [...new Set(names)].join(', ')
}

function ProblemLinks({ problems }: { problems: Problem[] }) {
  return (
    <ul className="admin-problems" data-testid="changes-problems">
      {problems.map((p, i) => {
        const place = placeOf(p.document)
        return (
          <li key={i}>
            <Link className="ui-link" to={place.to}>
              {place.name}
            </Link>
            : {p.message}
          </li>
        )
      })}
    </ul>
  )
}

type Pending = 'live' | 'discard' | null
type Result = { ok: boolean; text: string; n: number }

/** "You have changes that aren't live yet — Make changes live / Discard". */
export function ChangesBar({ state }: { state: ConfigState }) {
  const publish = usePublish()
  const discard = useDiscardDraft()
  const unsaved = useHasUnsavedEdits()
  const [pending, setPending] = useState<Pending>(null)
  const [note, setNote] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const busy = publish.isPending || discard.isPending
  const say = (ok: boolean, text: string) => setResult((p) => ({ ok, text, n: (p?.n ?? 0) + 1 }))
  const changed = state.draft_changed_sections.length > 0
  const problems = state.draft_problems

  if (!changed && !result) return null

  const onConfirm = () => {
    if (pending === 'live') {
      publish.mutate(
        { based_on_seq: state.draft_based_on_seq, note: note.trim() || null },
        {
          onSuccess: () => {
            setPending(null)
            setNote('')
            say(true, c.madeLive)
          },
          onError: (e) => {
            setPending(null)
            say(false, isStale(e) ? c.stale : e instanceof ConfigProblemsError ? c.fixFirst(e.problems.length) : c.liveFailed)
          },
        },
      )
    } else if (pending === 'discard') {
      discard.mutate(undefined, {
        onSuccess: () => {
          setPending(null)
          setResult(null)
        },
        onError: () => {
          setPending(null)
          say(false, c.discardFailed)
        },
      })
    }
  }

  return (
    <div className="admin-changesbar" role="region" aria-label={c.pending} data-testid="changes-bar">
      {changed ? (
        <div className="admin-changesbar__row">
          <p className="admin-changesbar__text" data-testid="changes-pending">
            <strong>{c.pending}</strong> <span className="admin-muted">{c.changedIn} {changedPlaces(state)}</span>
          </p>
          <div className="admin-actions">
            <Button
              onClick={() => setPending('live')}
              disabled={busy || unsaved || problems.length > 0 || state.stale}
              data-testid="changes-make-live"
            >
              {publish.isPending ? c.makingLive : c.makeLive}
            </Button>
            <Button variant="secondary" onClick={() => setPending('discard')} disabled={busy || unsaved} data-testid="changes-discard">
              {c.discard}
            </Button>
          </div>
        </div>
      ) : null}
      {changed && unsaved ? (
        <p className="admin-muted" data-testid="changes-unsaved">
          {c.unsaved}
        </p>
      ) : null}
      {changed && state.stale ? (
        <Notice tone="warning">
          <span data-testid="changes-stale">{c.stale}</span>
        </Notice>
      ) : null}
      {changed && problems.length ? (
        <div data-testid="changes-fix">
          <p>{c.fixFirst(problems.length)}</p>
          <ProblemLinks problems={problems} />
        </div>
      ) : null}
      {result ? (
        <ResultNotice testId="changes-result" focusKey={result.n} tone={result.ok ? 'info' : 'warning'}>
          {result.text}
        </ResultNotice>
      ) : null}
      <ConfirmDialog
        open={pending !== null}
        title={pending === 'live' ? c.liveTitle : c.discardTitle}
        confirmLabel={pending === 'live' ? c.liveConfirm : c.discardConfirm}
        cancelLabel={adminCopy.config.cancel}
        busy={busy}
        onConfirm={onConfirm}
        onCancel={() => setPending(null)}
        testId="changes-confirm"
      >
        <p>{pending === 'live' ? c.liveBody : c.discardBody}</p>
        {pending === 'live' ? (
          <>
            <p className="admin-muted">
              {c.changedIn} {changedPlaces(state)}
            </p>
            <TextField label={c.liveNote} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} data-testid="changes-note" />
          </>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}

/** Mounted once by the admin shell: Setup pages only, admins only, changes only. */
export function ShellChangesBar() {
  const { pathname } = useLocation()
  const session = useSession()
  const isAdmin = session.data?.state === 'signed-in' && session.data.user.role === 'admin'
  const setup = isSetupPath(pathname)
  const q = useConfigState()
  if (!setup || !isAdmin || !q.data) return null
  return <ChangesBar state={q.data} />
}

/** History page: what is live now and anything unusual about it. */
export function LiveStatus({ state }: { state: ConfigState }) {
  return (
    <div className="admin-panel admin-section" data-testid="live-status">
      <p>
        <span className="admin-muted">{adminCopy.config.live}: </span>
        <code data-testid="config-live-label">{state.active_label}</code>
      </p>
      <p>
        <span className="admin-muted">{adminCopy.config.entryAgent}: </span>
        <strong data-testid="config-entry">{state.entry_agent ?? adminCopy.agents.entryNone}</strong>
      </p>
      {!state.can_edit ? <Notice tone="info">{adminCopy.config.readOnly}</Notice> : null}
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
    </div>
  )
}

/** "Load example setup" (admins): fills the unsaved setup with the example clinic, after a confirm. */
export function LoadExampleButton({ variant = 'secondary' }: { variant?: 'primary' | 'secondary' }) {
  const load = useLoadDefaults()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} disabled={load.isPending} data-testid="load-example">
        {c.example}
      </Button>
      {result ? (
        <ResultNotice testId="load-example-result" focusKey={result.n} tone={result.ok ? 'info' : 'warning'}>
          {result.text}
        </ResultNotice>
      ) : null}
      <ConfirmDialog
        open={open}
        title={c.exampleTitle}
        confirmLabel={c.exampleConfirm}
        cancelLabel={adminCopy.config.cancel}
        busy={load.isPending}
        onConfirm={() =>
          load.mutate(undefined, {
            onSuccess: () => {
              setOpen(false)
              setResult((p) => ({ ok: true, text: c.exampleLoaded, n: (p?.n ?? 0) + 1 }))
            },
            onError: () => {
              setOpen(false)
              setResult((p) => ({ ok: false, text: c.exampleFailed, n: (p?.n ?? 0) + 1 }))
            },
          })
        }
        onCancel={() => setOpen(false)}
        testId="load-example-confirm"
      >
        <p>{c.exampleBody}</p>
      </ConfirmDialog>
    </>
  )
}
