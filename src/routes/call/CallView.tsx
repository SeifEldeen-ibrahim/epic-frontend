import { useEffect, useRef, type ReactNode } from 'react'
import { Button, Notice, Spinner } from '../../ui'
import { formatElapsed, type CallState, type CallStateKey } from './callMachine'
import { COPY, CRISIS, EPIC_MAIN_NUMBER } from './copy'
import './call.css'

export interface CallViewProps {
  state: CallState
  elapsedSeconds: number
  onCall: () => void
  onEnd: () => void
  onReset: () => void
  onUnlockAudio: () => void
}

function Panel({
  stateKey,
  children,
  alert = false,
}: {
  stateKey: CallStateKey
  children: ReactNode
  alert?: boolean
}) {
  return (
    <section
      className="call-panel"
      data-testid={`call-state-${stateKey}`}
      {...(alert ? { role: 'alert' } : { 'aria-live': 'polite' as const })}
    >
      {children}
    </section>
  )
}

function Bilingual({ en, es }: { en: string; es: string }) {
  return (
    <>
      <p className="call-status">{en}</p>
      <p className="call-es" lang="es">
        {es}
      </p>
    </>
  )
}

function MainLine() {
  return EPIC_MAIN_NUMBER.tel ? (
    <a className="ui-link" href={`tel:${EPIC_MAIN_NUMBER.tel}`}>
      {EPIC_MAIN_NUMBER.label}
    </a>
  ) : (
    <p>
      {EPIC_MAIN_NUMBER.label} <span lang="es">· {EPIC_MAIN_NUMBER.labelEs}</span>
    </p>
  )
}

function CrisisHelp() {
  return (
    <div className="call-help">
      <p>{CRISIS.en}</p>
      <p className="call-es" lang="es">
        {CRISIS.es}
      </p>
      <ul className="call-numbers">
        {CRISIS.numbers.map((n) => (
          <li key={n.tel}>
            <a className="ui-link" href={`tel:${n.tel}`}>
              {n.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Presentational only: every caller state, no data fetching, no media. */
export function CallView(props: CallViewProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const { key } = props.state

  useEffect(() => {
    const target =
      key === 'on_call'
        ? 'call-end'
        : key === 'ended' || key === 'handoff' || key === 'human_needed'
          ? 'call-again'
          : key === 'crisis'
            ? 'call-crisis-heading'
            : null
    if (target) rootRef.current?.querySelector<HTMLElement>(`[data-testid=${target}]`)?.focus()
  }, [key])

  return <div ref={rootRef}>{renderState(props)}</div>
}

function renderState({ state, elapsedSeconds, onCall, onEnd, onReset, onUnlockAudio }: CallViewProps) {
  switch (state.key) {
    case 'idle':
      return (
        <Panel stateKey="idle">
          <p>{COPY.recorded}</p>
          <Notice>{COPY.fictional}</Notice>
          <div className="call-actions">
            <Button data-testid="call-button" onClick={onCall}>
              {COPY.call}
            </Button>
          </div>
        </Panel>
      )
    case 'requesting_mic':
      return (
        <Panel stateKey="requesting_mic">
          <p className="call-status">{COPY.requestingMic}</p>
          <Spinner label={COPY.requestingMic} />
        </Panel>
      )
    case 'mic_denied':
      return (
        <Panel stateKey="mic_denied">
          <Bilingual {...COPY.micDenied} />
          <div className="call-actions">
            <Button disabled>{COPY.call}</Button>
          </div>
        </Panel>
      )
    case 'unsupported': {
      const copy = state.unsupportedReason === 'insecure' ? COPY.insecure : COPY.unsupported
      return (
        <Panel stateKey="unsupported">
          <Bilingual {...copy} />
          <MainLine />
        </Panel>
      )
    }
    case 'connecting':
      return (
        <Panel stateKey="connecting">
          <p className="call-status">{COPY.connecting}</p>
        </Panel>
      )
    case 'on_call':
      return (
        <Panel stateKey="on_call">
          <p className="call-status">{COPY.onCall}</p>
          <span className="call-timer" role="timer" aria-live="off" aria-label="Call time">
            {formatElapsed(elapsedSeconds)}
          </span>
          <div className="call-actions">
            {state.audioBlocked ? (
              <Button variant="secondary" data-testid="call-audio-unlock" onClick={onUnlockAudio}>
                {COPY.audioBlocked}
              </Button>
            ) : null}
            <Button data-testid="call-end" onClick={onEnd}>
              {COPY.end}
            </Button>
          </div>
        </Panel>
      )
    case 'ended':
      return (
        <Panel stateKey="ended">
          <Bilingual {...COPY.ended} />
          <div className="call-actions">
            <Button data-testid="call-again" onClick={onReset}>
              {COPY.callAgain}
            </Button>
          </div>
        </Panel>
      )
    case 'unavailable':
      return (
        <Panel stateKey="unavailable">
          <Bilingual {...COPY.unavailable} />
          <MainLine />
          <CrisisHelp />
          <div className="call-actions">
            <Button variant="secondary" data-testid="call-retry" onClick={onReset}>
              {COPY.tryAgain}
            </Button>
          </div>
        </Panel>
      )
    case 'crisis':
      // Final for this page: no Call again (a reload is acceptable).
      return (
        <Panel stateKey="crisis" alert>
          <h2 className="call-status call-heading" tabIndex={-1} data-testid="call-crisis-heading">
            {COPY.crisis.en}
          </h2>
          <p className="call-es" lang="es">
            {COPY.crisis.es}
          </p>
          <CrisisHelp />
        </Panel>
      )
    case 'handoff': {
      const title = state.handoffTitle ?? ''
      return (
        <Panel stateKey="handoff">
          <Bilingual en={COPY.handoff.en(title)} es={COPY.handoff.es(title)} />
          <Bilingual en={COPY.handoff.recordedEn} es={COPY.handoff.recordedEs} />
          <div className="call-actions">
            <Button data-testid="call-again" onClick={onReset}>
              {COPY.callAgain}
            </Button>
          </div>
        </Panel>
      )
    }
    case 'human_needed':
      return (
        <Panel stateKey="human_needed">
          <Bilingual {...COPY.humanNeeded} />
          <MainLine />
          <div className="call-actions">
            <Button data-testid="call-again" onClick={onReset}>
              {COPY.callAgain}
            </Button>
          </div>
        </Panel>
      )
  }
}
