import { useSearchParams } from 'react-router'
import { useScreenText } from '../../api/calls'
import { PageLayout } from '../../ui'
import { CallView } from './CallView'
import { COPY } from './copy'
import { sanitizeTester, useCall } from './useCall'

export function CallPage() {
  const [params] = useSearchParams()
  const { state, elapsedSeconds, start, end, reset, unlockAudio, audioRef } = useCall(
    sanitizeTester(params.get('tester')),
  )
  // Never throws: while loading or on failure the view uses the shipped English and Spanish text.
  const screenText = useScreenText()

  return (
    <PageLayout title="Call" data-testid="call-page">
      <h1>{COPY.heading}</h1>
      <CallView
        state={state}
        elapsedSeconds={elapsedSeconds}
        onCall={() => void start()}
        onEnd={end}
        onReset={reset}
        onUnlockAudio={unlockAudio}
        screenText={screenText.text}
      />
      <audio ref={audioRef} autoPlay playsInline hidden data-testid="call-audio" />
    </PageLayout>
  )
}
