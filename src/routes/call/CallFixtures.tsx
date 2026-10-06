import { Link, useParams } from 'react-router'
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
  ended: { key: 'ended' },
  unavailable: { key: 'unavailable' },
}

const noop = () => undefined

/** Dev-only (loaded only when import.meta.env.DEV): every caller state, no mic, for screenshots. */
export function CallFixtures() {
  const { state } = useParams()
  return (
    <PageLayout title="Call" data-testid="call-fixtures-root">
      <h1>{COPY.heading}</h1>
      {isCallStateKey(state) ? (
        <CallView
          state={FIXTURE_STATES[state]}
          elapsedSeconds={83}
          onCall={noop}
          onEnd={noop}
          onReset={noop}
          onUnlockAudio={noop}
        />
      ) : (
        <ul>
          {CALL_STATES.map((key) => (
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
