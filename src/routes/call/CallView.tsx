import { useEffect, useRef, type ReactNode } from 'react'
import { Button, Notice, Spinner } from '../../ui'
import type { ScreenLanguage, ScreenText } from '../../api/calls'
import { formatElapsed, type CallState, type CallStateKey, type Lang } from './callMachine'
import { COPY, CRISIS, EPIC_MAIN_NUMBER, SHIPPED_SCREEN_TEXT } from './copy'
import './call.css'

export interface CallViewProps {
  state: CallState
  elapsedSeconds: number
  onCall: () => void
  onEnd: () => void
  onReset: () => void
  onUnlockAudio: () => void
  /** Screen text from `GET /api/screen-text`; null/absent: the shipped English and Spanish text. */
  screenText?: ScreenText | null
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

type ScreenLines = Pick<ScreenLanguage, 'code' | 'dir' | 'lines'>

const SHIPPED = SHIPPED_SCREEN_TEXT.languages

/** en, es (always: the crisis screen needs Spanish), then the other enabled languages. Missing
 * en/es lines fall back to the shipped text. */
function languagesOf(text: ScreenText | null | undefined): ScreenLines[] {
  const served = text?.languages ?? []
  const merged = SHIPPED.map((shipped) => {
    const own = served.find((l) => l.code === shipped.code)
    return { ...shipped, ...own, lines: { ...shipped.lines, ...own?.lines } }
  })
  return [...merged, ...served.filter((l) => l.code !== 'en' && l.code !== 'es')]
}

function numbersOf(text: ScreenText | null | undefined) {
  const served = text?.crisis_numbers.filter((n) => n.replace(/\D/g, '')) ?? []
  return served.length ? served.map((label) => ({ label, tel: label.replace(/\D/g, '') })) : CRISIS.numbers
}

/** A known enabled call language shows only that language; otherwise every enabled one. */
function shownFor(language: Lang | null | undefined, all: ScreenLines[]): ScreenLines[] {
  const code = language?.toLowerCase().split(/[-_]/)[0]
  const known = code ? all.find((l) => l.code === code) : undefined
  return known ? [known] : all
}

function lineOf(lang: ScreenLines, key: string, title?: string): string | null {
  const text = lang.lines[key]
  if (!text) return null
  return title === undefined ? text : text.split('{title}').join(title)
}

/** In right-to-left text a number such as 516-227-8255 is drawn group by group in reverse, which
 * would show a caller the wrong number to dial. Each number is kept left-to-right in its own
 * isolate; left-to-right text is returned unchanged. */
function keepNumbers(text: string, dir: string): ReactNode {
  if (dir !== 'rtl') return text
  return text.split(/(\d[\d\- ]*\d|\d)/).map((part, i) =>
    i % 2 === 1 ? (
      <bdi key={i} dir="ltr">
        {part}
      </bdi>
    ) : (
      part
    ),
  )
}

/** One block per language (each with its own `lang`/`dir`); the first is the main status line.
 * A language without this line is left out; English stands in if none has it. */
function Lines({ langs, line, title }: { langs: ScreenLines[]; line: string; title?: string }) {
  const blocks = langs.flatMap((lang) => {
    const text = lineOf(lang, line, title)
    return text ? [{ lang, text }] : []
  })
  const shown = blocks.length ? blocks : [{ lang: SHIPPED[0], text: lineOf(SHIPPED[0], line, title) ?? '' }]
  return (
    <>
      {shown.map(({ lang, text }, i) => (
        <p key={lang.code} className={i === 0 ? 'call-status' : 'call-es'} lang={lang.code} dir={lang.dir}>
          {keepNumbers(text, lang.dir)}
        </p>
      ))}
    </>
  )
}

function MainLine({ langs }: { langs: ScreenLines[] }) {
  const labels = langs.flatMap((lang) => {
    const text = lineOf(lang, 'main_line_label')
    return text ? [{ lang, text }] : []
  })
  if (EPIC_MAIN_NUMBER.tel) {
    const first = labels[0] ?? { lang: SHIPPED[0], text: EPIC_MAIN_NUMBER.label }
    return (
      <a className="ui-link" href={`tel:${EPIC_MAIN_NUMBER.tel}`} lang={first.lang.code} dir={first.lang.dir}>
        {first.text}
      </a>
    )
  }
  return (
    <p>
      {labels.map(({ lang, text }, i) => (
        <span key={lang.code} lang={lang.code} dir={lang.dir}>
          {i > 0 ? ' · ' : ''}
          {keepNumbers(text, lang.dir)}
        </span>
      ))}
    </p>
  )
}

function CrisisNumbers({ numbers }: { numbers: { label: string; tel: string }[] }) {
  return (
    <ul className="call-numbers" data-testid="call-crisis-numbers">
      {numbers.map((n) => (
        <li key={n.tel}>
          <a className="ui-link" href={`tel:${n.tel}`}>
            {n.label}
          </a>
        </li>
      ))}
    </ul>
  )
}

function CrisisHelp({ langs, numbers }: { langs: ScreenLines[]; numbers: { label: string; tel: string }[] }) {
  return (
    <div className="call-help">
      {langs.map((lang, i) => {
        const text = lineOf(lang, 'crisis_help')
        return text ? (
          <p key={lang.code} className={i === 0 ? undefined : 'call-es'} lang={lang.code} dir={lang.dir}>
            {keepNumbers(text, lang.dir)}
          </p>
        ) : null
      })}
      <CrisisNumbers numbers={numbers} />
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

function renderState({ state, elapsedSeconds, onCall, onEnd, onReset, onUnlockAudio, screenText }: CallViewProps) {
  // Crisis and pre-call errors show every enabled language whatever the call's language.
  const all = languagesOf(screenText)
  const numbers = numbersOf(screenText)
  const lang = shownFor(state.language, all)
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
          <Lines langs={all} line="mic_denied" />
          <div className="call-actions">
            <Button disabled>{COPY.call}</Button>
          </div>
        </Panel>
      )
    case 'unsupported': {
      const line = state.unsupportedReason === 'insecure' ? 'insecure' : 'unsupported'
      return (
        <Panel stateKey="unsupported">
          <Lines langs={all} line={line} />
          <MainLine langs={all} />
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
    case 'reconnecting':
      return (
        <Panel stateKey="reconnecting">
          <Lines langs={lang} line="reconnecting" />
          <div className="call-actions">
            <Button data-testid="call-end" onClick={onEnd}>
              {COPY.end}
            </Button>
          </div>
        </Panel>
      )
    case 'ended':
      return (
        <Panel stateKey="ended">
          <Lines langs={lang} line="ended" />
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
          <Lines langs={all} line="unavailable" />
          <MainLine langs={all} />
          <CrisisHelp langs={all} numbers={numbers} />
          <div className="call-actions">
            <Button variant="secondary" data-testid="call-retry" onClick={onReset}>
              {COPY.tryAgain}
            </Button>
          </div>
        </Panel>
      )
    case 'crisis':
      // Final for this page: no Call again (a reload is acceptable). The numbers come first so
      // they are on screen without scrolling; then English, Spanish and every other language.
      return (
        <Panel stateKey="crisis" alert>
          <CrisisNumbers numbers={numbers} />
          {all.map((l, i) => {
            const heading = lineOf(l, 'crisis')
            const help = lineOf(l, 'crisis_help')
            return (
              <div key={l.code} className="call-help" lang={l.code} dir={l.dir} data-testid={`call-crisis-${l.code}`}>
                {i === 0 ? (
                  <h2 className="call-status call-heading" tabIndex={-1} data-testid="call-crisis-heading">
                    {heading && keepNumbers(heading, l.dir)}
                  </h2>
                ) : heading ? (
                  <p className="call-es">{keepNumbers(heading, l.dir)}</p>
                ) : null}
                {help ? <p className={i === 0 ? undefined : 'call-es'}>{keepNumbers(help, l.dir)}</p> : null}
              </div>
            )
          })}
        </Panel>
      )
    case 'handoff': {
      const title = state.handoffTitle ?? ''
      return (
        <Panel stateKey="handoff">
          <Lines langs={lang} line="handoff_title" title={title} />
          <Lines langs={lang} line="handoff_recorded" />
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
          <Lines langs={lang} line="human_needed_screen" />
          <MainLine langs={lang} />
          <div className="call-actions">
            <Button data-testid="call-again" onClick={onReset}>
              {COPY.callAgain}
            </Button>
          </div>
        </Panel>
      )
  }
}
