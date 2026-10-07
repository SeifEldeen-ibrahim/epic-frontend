import { useId } from 'react'
import { adminCopy, formatTimeOfDay, label } from '../../admin/copy'
import { useAcknowledgeFlag, type CallDetail, type TimelineEntry } from '../../api/admin'
import { Button, StatusBadge } from '../../ui'

const c = adminCopy.detail

function byTime(a: TimelineEntry, b: TimelineEntry) {
  return Date.parse(a.at) - Date.parse(b.at)
}

/** Sessions plus one ordered list of turns, agent actions and flags. */
export function CallTimeline({
  callId,
  sessions,
  timeline,
  readOnly,
  onDone,
  onError,
}: {
  callId: string
  sessions: CallDetail['sessions']
  timeline: CallDetail['timeline']
  readOnly: boolean
  onDone: (text: string) => void
  onError: (error: unknown) => void
}) {
  const ack = useAcknowledgeFlag(callId)
  const headingId = useId()
  const entries = [...timeline].sort(byTime)
  return (
    <section
      id="transcript"
      className="admin-panel admin-section admin-detail__timeline"
      aria-labelledby={headingId}
      data-testid="detail-timeline"
    >
      <h2 id={headingId}>{c.transcript}</h2>
      <h3>{c.sessions}</h3>
      {sessions.length ? (
        <ul className="admin-plain-list" data-testid="detail-sessions">
          {sessions.map((s) => (
            <li key={s.seq}>
              {c.session(s.seq)} · {label(s.agent_package)} · {c.voice} {s.voice} · {c.endReason}{' '}
              {label(s.end_reason)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="admin-muted">{c.noSessions}</p>
      )}
      <h3>{c.timeline}</h3>
      {entries.length === 0 ? (
        <p className="admin-muted">{c.emptyTimeline}</p>
      ) : (
        <ol className="admin-timeline">
          {entries.map((e) => {
            if (e.entry_type === 'turn') {
              return (
                <li
                  key={`turn-${e.seq}`}
                  className={`admin-timeline__item admin-timeline__item--${e.speaker}`}
                  data-testid="timeline-turn"
                >
                  <div className="admin-timeline__meta">
                    <strong>{e.speaker === 'caller' ? c.caller : c.agent}</strong>
                    <time dateTime={e.at}>{formatTimeOfDay(e.at)}</time>
                    {e.latency_ms != null ? <span>{c.latency(e.latency_ms)}</span> : null}
                  </div>
                  <p>{e.text}</p>
                </li>
              )
            }
            if (e.entry_type === 'action') {
              return (
                <li key={e.id} className="admin-timeline__item admin-timeline__item--action" data-testid="timeline-action">
                  <div className="admin-timeline__meta">
                    <strong>
                      {c.action}: {label(e.kind)}
                      {e.name ? ` · ${e.name}` : ''}
                    </strong>
                    <time dateTime={e.at}>{formatTimeOfDay(e.at)}</time>
                    {e.delegation_ms != null ? <span>{c.delegation(e.delegation_ms)}</span> : null}
                  </div>
                </li>
              )
            }
            const pending = e.status === 'open' || e.status === 'carried'
            return (
              <li key={e.id} className="admin-timeline__item admin-timeline__item--flag" data-testid="timeline-flag">
                <div className="admin-timeline__meta">
                  <strong>
                    {c.flag}: {label(e.kind)}
                    {e.form_field ? ` · ${c.field} ${e.form_field}` : ''}
                  </strong>
                  <StatusBadge tone={pending ? 'warning' : 'ok'}>{label(e.status)}</StatusBadge>
                  <time dateTime={e.at}>{formatTimeOfDay(e.at)}</time>
                </div>
                {e.detail ? <p>{e.detail}</p> : null}
                {pending && !readOnly ? (
                  <div className="admin-actions">
                    <Button
                      variant="secondary"
                      data-testid={`flag-ack-${e.id}`}
                      aria-label={c.acknowledgeFlag(label(e.kind))}
                      disabled={ack.isPending}
                      onClick={() => ack.mutate(e.id, { onSuccess: () => onDone(c.flagAcked), onError })}
                    >
                      {ack.isPending && ack.variables === e.id ? c.acknowledging : c.acknowledge}
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
