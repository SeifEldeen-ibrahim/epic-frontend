import { useId, useState } from 'react'
import { useSetVoiceMode, useVoiceMode, type VoiceMode } from '../../api/admin'
import { AdminPage, ResultNotice } from '../../admin/DataTable'
import { adminCopy, formatTime } from '../../admin/copy'
import { Button, ErrorState } from '../../ui'

const c = adminCopy.settings
const MODES: VoiceMode[] = ['gpt-live', 'realtime']

type Result = { ok: boolean; n: number }

/** Admin-only: the voice mode new calls start in (GPT-Live + Luna, or Realtime without Luna). */
export function SettingsPage() {
  const q = useVoiceMode()
  const save = useSetVoiceMode()
  // null = no unsaved pick: the saved mode is selected
  const [picked, setPicked] = useState<VoiceMode | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const legendId = useId()

  const current = q.data?.mode ?? null
  const choice = picked ?? current

  const onSave = () => {
    if (choice === null) return
    save.mutate(choice, {
      onSuccess: () => {
        setPicked(null)
        setResult((p) => ({ ok: true, n: (p?.n ?? 0) + 1 }))
      },
      onError: () => {
        setPicked(null)
        setResult((p) => ({ ok: false, n: (p?.n ?? 0) + 1 }))
      },
    })
  }

  let body
  if (q.isPending) {
    body = (
      <div className="admin-panel admin-section admin-settings" aria-busy="true" data-testid="settings-loading">
        <span className="admin-sr-only">{c.loading}</span>
        <span className="admin-skeleton admin-settings__skeleton" />
        <span className="admin-skeleton admin-settings__skeleton" />
        <span className="admin-skeleton admin-settings__skeleton" />
      </div>
    )
  } else if (!q.data) {
    body = <ErrorState message={c.error} onRetry={() => void q.refetch()} data-testid="settings-error" />
  } else {
    const unchanged = choice === null || choice === q.data.mode
    body = (
      <form
        className="admin-panel admin-section admin-settings"
        onSubmit={(e) => {
          e.preventDefault()
          onSave()
        }}
      >
        <fieldset className="admin-settings__group" aria-describedby={`${legendId}-hint`}>
          <legend id={legendId} className="admin-settings__legend">
            {c.voiceMode}
          </legend>
          <p id={`${legendId}-hint`} className="admin-muted admin-settings__hint">
            {c.voiceModeHint}
          </p>
          {MODES.map((mode) => (
            <label key={mode} className="admin-settings__option" data-testid={`settings-mode-${mode}`}>
              <input
                type="radio"
                name="voice-mode"
                value={mode}
                checked={choice === mode}
                disabled={save.isPending}
                onChange={() => setPicked(mode)}
                className="admin-settings__radio"
              />
              <span className="admin-settings__text">
                <span className="admin-settings__label">
                  {c.options[mode].label}
                  {q.data.mode === mode ? <span className="admin-settings__current"> · {c.current}</span> : null}
                </span>
                <span className="admin-muted">{c.options[mode].hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="admin-muted admin-settings__meta" data-testid="settings-meta">
          {q.data.stored ? c.lastChanged(formatTime(q.data.updated_at ?? null)) : c.defaultNote}
        </p>
        <Button type="submit" disabled={unchanged || save.isPending} data-testid="settings-save">
          {save.isPending ? c.saving : c.save}
        </Button>
      </form>
    )
  }

  return (
    <AdminPage page="settings">
      <div className="admin-settings__wrap" data-testid="settings-voice-mode">
        <div className="admin-settings__notice">
          {result ? (
            <ResultNotice testId="settings-result" focusKey={result.n} tone={result.ok ? 'info' : 'warning'}>
              {result.ok ? c.saved : c.saveError}
            </ResultNotice>
          ) : null}
        </div>
        {body}
      </div>
    </AdminPage>
  )
}
