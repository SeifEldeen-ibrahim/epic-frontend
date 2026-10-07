import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ConfigProblemsError, useConfigState, useRollback, useVersionDiff } from '../../api/config'
import { ConfirmDialog } from '../../admin/ConfirmDialog'
import { AdminPage, ResultNotice } from '../../admin/DataTable'
import { DiffView } from '../../admin/DiffView'
import { adminCopy } from '../../admin/copy'
import { Button, EmptyState, ErrorState, TextField } from '../../ui'

const c = adminCopy.versions

/** /admin/versions/:seq: what changed in this version, and roll back to it (admins). */
export function VersionDetailPage() {
  const seq = Number(useParams().seq)
  const q = useVersionDiff(seq)
  const state = useConfigState()
  const rollback = useRollback()
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState('')
  const [result, setResult] = useState<{ ok: boolean; text: string; n: number } | null>(null)

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
        <span className="admin-skeleton" />
        <span className="admin-skeleton" />
      </div>
    )
  } else {
    const d = q.data
    body = (
      <div className="admin-section" data-testid="version-detail">
        <p>
          <code>{d.before}</code> → <code data-testid="version-label">{d.after}</code>
        </p>
        <h2>{c.diffTitle}</h2>
        {d.sections.length === 0 ? (
          <EmptyState title={c.noDiff} data-testid="version-nodiff" />
        ) : (
          d.sections.map((s) => (
            <div key={s.section} className="admin-section">
              <h3>{s.section}</h3>
              <DiffView diff={s.diff} testId={`version-diff-${s.section}`} />
            </div>
          ))
        )}
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
              onSuccess: (r) => {
                setConfirming(false)
                setResult((p) => ({ ok: true, text: c.rolledBack(r.live_label), n: (p?.n ?? 0) + 1 }))
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
