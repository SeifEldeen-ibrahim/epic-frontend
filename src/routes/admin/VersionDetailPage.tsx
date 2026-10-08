import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ConfigProblemsError, useConfigState, useRollback, useVersionDiff, useVersions } from '../../api/config'
import { ChangeList } from '../../admin/ChangeList'
import { useToolNames, versionHeading } from '../../admin/changeLabels'
import { ConfirmDialog } from '../../admin/ConfirmDialog'
import { AdminPage, ResultNotice } from '../../admin/DataTable'
import { adminCopy, formatTime } from '../../admin/copy'
import { Button, EmptyState, ErrorState, StatusBadge, TextField } from '../../ui'

const c = adminCopy.versions

/** /admin/versions/:seq: what changed in this version, in plain words, and go back to it (admins). */
export function VersionDetailPage() {
  const seq = Number(useParams().seq)
  const q = useVersionDiff(seq)
  const list = useVersions()
  const state = useConfigState()
  const rollback = useRollback()
  const tools = useToolNames()
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState('')
  const [result, setResult] = useState<{ ok: boolean; text: string; n: number } | null>(null)

  const all = list.data?.versions ?? []
  const item = all.find((x) => x.seq === seq)
  let body
  if (!Number.isInteger(seq) || seq < 1 || (q.isError && !q.data)) {
    body = q.isError && !(q.error && 'isNotFound' in q.error && q.error.isNotFound) ? (
      <ErrorState message={c.error} onRetry={() => void q.refetch()} data-testid="version-error" />
    ) : (
      <EmptyState title={c.notFound} data-testid="version-not-found" />
    )
  } else if (q.isPending) {
    body = (
      <div className="admin-panel admin-section" aria-busy="true" data-testid="version-loading">
        <span className="admin-sr-only">{adminCopy.loading}</span>
        <span className="admin-skeleton" />
        <span className="admin-skeleton" />
      </div>
    )
  } else {
    const d = q.data
    const base = d.compared_with ? all.find((x) => x.seq === d.compared_with) : undefined
    body = (
      <div className="admin-section" data-testid="version-detail">
        {item ? (
          <div className="admin-panel admin-version" data-testid="version-meta">
            <div className="admin-version__head">
              <p className="admin-version__heading">{versionHeading(item, all)}</p>
              {item.active ? (
                <span data-testid="version-live">
            <StatusBadge tone="ok">{c.live}</StatusBadge>
          </span>
              ) : null}
            </div>
            {item.note ? (
              <p className="admin-version__note">
                <span className="admin-muted">{c.noteLabel} </span>
                {item.note}
              </p>
            ) : null}
          </div>
        ) : null}
        <h2>{c.whatChanged}</h2>
        <p className="admin-muted" data-testid="version-compared">
          {d.compared_with === null || d.compared_with === undefined ? c.firstVersion : base ? c.comparedWith(formatTime(base.created_at)) : null}
        </p>
        {d.changes.length === 0 ? (
          <EmptyState title={c.noChanges} data-testid="version-nochanges" />
        ) : (
          <ChangeList changes={d.changes} names={d.names} tools={tools} testId="version-changes" />
        )}
        <details className="admin-details admin-disclosure admin-section" data-testid="version-advanced">
          <summary>{c.advanced}</summary>
          <p>
            <span className="admin-muted">{c.reference}: </span>
            <code data-testid="version-label">{d.after}</code>
          </p>
        </details>
      </div>
    )
  }
  const canRollback = state.data?.can_edit && q.data && state.data.active_seq !== seq
  return (
    <AdminPage
      page="version-detail"
      actions={
        <div className="admin-actions">
          <Link className="ui-link" to="/admin/versions" data-testid="version-back">
            {adminCopy.config.back}
          </Link>
          {canRollback ? (
            <Button variant="secondary" onClick={() => setConfirming(true)} data-testid="version-rollback">
              {c.rollback}
            </Button>
          ) : null}
        </div>
      }
    >
      {result ? (
        <ResultNotice testId="version-result" focusKey={result.n} tone={result.ok ? 'info' : 'warning'}>
          {result.text}
        </ResultNotice>
      ) : null}
      {body}
      <ConfirmDialog
        open={confirming}
        title={c.rollbackTitle}
        confirmLabel={c.rollbackConfirm}
        cancelLabel={adminCopy.config.cancel}
        busy={rollback.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          rollback.mutate(
            { seq, note: note.trim() || null },
            {
              onSuccess: () => {
                setConfirming(false)
                setResult((p) => ({ ok: true, text: c.rolledBack, n: (p?.n ?? 0) + 1 }))
              },
              onError: (e) => {
                setConfirming(false)
                setResult((p) => ({
                  ok: false,
                  text: e instanceof ConfigProblemsError ? c.rollbackFailed : adminCopy.config.saveFailed,
                  n: (p?.n ?? 0) + 1,
                }))
              },
            },
          )
        }
        testId="version-confirm"
      >
        <p>{c.rollbackBody}</p>
        <TextField label={adminCopy.changes.liveNote} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} data-testid="version-note" />
      </ConfirmDialog>
    </AdminPage>
  )
}
