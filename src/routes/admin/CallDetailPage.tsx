import { useQueryClient } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { adminCopy, formatTime, label, orDash, outcomeTone, yesNo } from '../../admin/copy'
import { AdminPage, ResultNotice } from '../../admin/DataTable'
import { AdminApiError, sessionQueryKey, useCallDetail, type CallDetail } from '../../api/admin'
import type { Session } from '../../api/auth'
import { ErrorState, Notice, StatusBadge } from '../../ui'
import { CallTimeline } from './CallTimeline'
import { FormPanel, type HistoryItem } from './FormPanel'

const c = adminCopy.detail

/** One term/value pair inside an `.admin-facts` list. */
export function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="admin-facts__item">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="admin-detail" data-testid="detail-loading" aria-busy="true">
      <span className="admin-sr-only">{adminCopy.loading}</span>
      {(['header', 'form', 'recording', 'timeline'] as const).map((area) => (
        <div
          key={area}
          className={`admin-panel admin-detail__${area} admin-detail__placeholder admin-detail__placeholder--${area}`}
          aria-hidden="true"
        >
          <span className="admin-skeleton" />
          <span className="admin-skeleton" />
          <span className="admin-skeleton" />
        </div>
      ))}
    </div>
  )
}

interface Result {
  key: number
  text: string
  tone: 'info' | 'warning'
  conflict: boolean
}

export function CallDetailPage() {
  const { callId = '' } = useParams()
  const query = useCallDetail(callId)
  const qc = useQueryClient()
  const [result, setResult] = useState<Result | null>(null)
  const [localHistory, setLocalHistory] = useState<HistoryItem[]>([])

  const notify = (text: string, tone: Result['tone'], conflict = false) =>
    setResult((r) => ({ key: (r?.key ?? 0) + 1, text, tone, conflict }))
  const onDone = (text: string) => notify(text, 'info')
  const onError = (error: unknown) => {
    if (error instanceof AdminApiError && error.isConflict) {
      setLocalHistory([])
      notify(c.conflict, 'warning', true)
      void query.refetch()
      return
    }
    notify(c.failed, 'warning')
  }

  if (query.isPending) {
    return (
      <AdminPage page="call-detail">
        <DetailSkeleton />
      </AdminPage>
    )
  }
  if (query.isError) {
    const notFound = query.error instanceof AdminApiError && query.error.isNotFound
    return (
      <AdminPage page="call-detail">
        {notFound ? (
          <div className="ui-state" data-testid="detail-not-found">
            <strong>{c.notFound}</strong>
            <Link className="ui-link admin-detail__jump" to="/admin/calls">
              {c.backToCalls}
            </Link>
          </div>
        ) : (
          <ErrorState
            data-testid="detail-error"
            message={c.error}
            retryLabel={adminCopy.retry}
            onRetry={() => void query.refetch()}
          />
        )}
      </AdminPage>
    )
  }

  const session = qc.getQueryData<Session>(sessionQueryKey)
  const staffEmail = session && session.state !== 'signed-out' ? session.user.email : null
  return (
    <AdminPage page="call-detail">
      {result ? (
        <ResultNotice testId={result.conflict ? 'detail-conflict' : 'detail-result'} focusKey={result.key} tone={result.tone}>
          {result.text}
        </ResultNotice>
      ) : null}
      <CallDetailBody
        detail={query.data}
        history={[...query.data.field_history, ...localHistory]}
        staffEmail={staffEmail}
        onDone={onDone}
        onError={onError}
        onEdited={(item) => setLocalHistory((h) => [...h, item])}
      />
    </AdminPage>
  )
}

function CallDetailBody({
  detail,
  history,
  staffEmail,
  onDone,
  onError,
  onEdited,
}: {
  detail: CallDetail
  history: HistoryItem[]
  staffEmail: string | null
  onDone: (text: string) => void
  onError: (error: unknown) => void
  onEdited: (item: HistoryItem) => void
}) {
  const headerId = useId()
  const recordingId = useId()
  const { call, recording } = detail
  const live = call.status === 'live'
  const flagsOpen = detail.timeline.some((e) => e.entry_type === 'flag' && (e.status === 'open' || e.status === 'carried'))
  return (
    <>
      {live ? (
        <div className="admin-result" data-testid="detail-live">
          <Notice tone="info">{c.live}</Notice>
        </div>
      ) : null}
      <div className="admin-detail">
        <a className="ui-link admin-detail__jump" href="#transcript" data-testid="detail-jump">
          {c.jump}
        </a>
        <section className="admin-panel admin-section admin-detail__header" aria-labelledby={headerId} data-testid="detail-header">
          <h2 id={headerId}>{c.summary}</h2>
          <dl className="admin-facts">
            <Fact term={adminCopy.cols.status}>{live ? c.inProgress : label(call.status)}</Fact>
            <Fact term={adminCopy.cols.outcome}>
              {call.outcome ? <StatusBadge tone={outcomeTone(call.outcome)}>{label(call.outcome)}</StatusBadge> : adminCopy.dash}
            </Fact>
            <Fact term={adminCopy.cols.started}>{formatTime(call.started_at)}</Fact>
            <Fact term={adminCopy.cols.ended}>{formatTime(call.ended_at)}</Fact>
            <Fact term={adminCopy.cols.language}>{orDash(call.language)}</Fact>
            <Fact term={adminCopy.cols.route}>{label(call.route_role)}</Fact>
            <Fact term={adminCopy.cols.category}>{label(call.inquiry_category)}</Fact>
            <Fact term={adminCopy.cols.agentVersion}>{call.agent_version}</Fact>
            <Fact term={adminCopy.cols.voiceMode}>
              <span data-testid="call-voice-mode">{adminCopy.voiceModes[call.voice_mode] ?? adminCopy.voiceModes['gpt-live']}</span>
            </Fact>
            <Fact term={adminCopy.cols.tester}>{orDash(call.tester_label)}</Fact>
            <Fact term={adminCopy.cols.afterHours}>{yesNo(call.after_hours)}</Fact>
            {call.stated_name ? <Fact term={c.statedName}>{call.stated_name}</Fact> : null}
            {call.stated_reason ? <Fact term={c.statedReason}>{call.stated_reason}</Fact> : null}
          </dl>
        </section>
        <FormPanel
          callId={call.id}
          form={detail.form}
          outcome={call.outcome}
          readOnly={live}
          flagsOpen={flagsOpen}
          history={history}
          staffEmail={staffEmail}
          onDone={onDone}
          onError={onError}
          onEdited={onEdited}
        />
        <section
          className="admin-panel admin-section admin-detail__recording"
          aria-labelledby={recordingId}
          data-testid="detail-recording"
        >
          <h2 id={recordingId}>{c.recording}</h2>
          {call.voice_mode === 'realtime' ? (
            <p data-testid="call-no-recording-realtime">{c.noRecordingRealtime}</p>
          ) : recording.available && !live ? (
            <audio
              className="admin-audio"
              controls
              preload="none"
              aria-label={c.audioLabel}
              src={`/api/admin/calls/${encodeURIComponent(call.id)}/recording`}
              data-testid="detail-audio"
            />
          ) : (
            <p data-testid="detail-recording-unavailable">
              {c.recordingUnavailable(live ? c.liveReason : (recording.reason ?? c.noReason))}
            </p>
          )}
        </section>
        <CallTimeline
          callId={call.id}
          sessions={detail.sessions}
          timeline={detail.timeline}
          readOnly={live}
          onDone={onDone}
          onError={onError}
        />
      </div>
    </>
  )
}
