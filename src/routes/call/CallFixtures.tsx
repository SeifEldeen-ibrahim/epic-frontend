import { Link, useParams, useSearchParams } from 'react-router'
import { PageLayout } from '../../ui'
import { CALL_STATES, isCallStateKey, type CallState } from './callMachine'
import { CallView } from './CallView'
import { COPY } from './copy'

const FIXTURE_STATES: Record<string, CallState> = {
  idle: { key: 'idle' },
  requesting_mic: { key: 'requesting_mic' },
  mic_denied: { key: 'mic_denied' },
  unsupported: { key: 'unsupported', unsupportedReason: 'no_webrtc' },
  connecting: { key: 'connecting' },
  on_call: { key: 'on_call', startedAt: 0 },
  reconnecting: { key: 'reconnecting', startedAt: 0 },
  ended: { key: 'ended' },
  unavailable: { key: 'unavailable' },
  crisis: { key: 'crisis' },
  handoff: { key: 'handoff', handoffTitle: 'Residential & Day Programs' },
  human_needed: { key: 'human_needed' },
}

/** Call-language variants: `<state>-es` / `<state>-en` (or any state with `?lang=es|en`). */
const LANGUAGE_VARIANTS = [
  'reconnecting-es',
  'ended-es',
  'handoff-es',
  'human_needed-es',
  'ended-en',
  'handoff-en',
  'human_needed-en',
  'crisis-en',
  'crisis-es',
]

function fixtureFor(param: string | undefined, langParam: string | null): CallState | null {
  const [base, suffix, extra] = (param ?? '').split('-')
  if (!isCallStateKey(base) || extra !== undefined) return null
  if (suffix !== undefined && suffix !== 'es' && suffix !== 'en') return null
  const language = suffix ?? (langParam === 'es' || langParam === 'en' ? langParam : null)
  return language ? { ...FIXTURE_STATES[base], language } : FIXTURE_STATES[base]
}

const noop = () => undefined

/** Dev-only (loaded only when import.meta.env.DEV): every caller state, no mic, for screenshots. */
export function CallFixtures() {
  const { state } = useParams()
  const [searchParams] = useSearchParams()
  const fixture = fixtureFor(state, searchParams.get('lang'))
  return (
    <PageLayout title="Call" data-testid="call-fixtures-root">
      <h1>{COPY.heading}</h1>
      {fixture ? (
        <CallView
          state={fixture}
          elapsedSeconds={83}
          onCall={noop}
          onEnd={noop}
          onReset={noop}
          onUnlockAudio={noop}
        />
      ) : (
        <ul>
          {[...CALL_STATES, ...LANGUAGE_VARIANTS].map((key) => (
            <li key={key}>
              <Link className="ui-link" to={`/call/fixtures/${key}`}>
                {key}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageLayout>
  )
}
