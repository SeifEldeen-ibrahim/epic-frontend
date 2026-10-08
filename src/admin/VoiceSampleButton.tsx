import type { SampleStatus } from '../api/voiceSample'
import { Button } from '../ui'
import { adminCopy } from './copy'

const c = adminCopy.agents

/** Play / Stop toggle for a voice sample, with a polite live status line. Presentational. */
export function VoiceSampleButton({
  voice,
  status,
  onPlay,
  onStop,
}: {
  voice: string
  status: SampleStatus
  onPlay: () => void
  onStop: () => void
}) {
  const busy = status === 'loading'
  const playing = status === 'playing'
  return (
    <div className="admin-voice-sample">
      <Button
        variant="secondary"
        onClick={playing ? onStop : onPlay}
        disabled={busy || !voice}
        aria-label={playing ? c.stopSample : c.sampleLabel(voice)}
        data-testid="agent-voice-sample"
        data-status={status}
      >
        {busy ? c.sampleLoading : playing ? c.stopSample : c.playSample}
      </Button>
      <p className="admin-voice-sample__status" role="status" aria-live="polite" data-testid="agent-voice-sample-status">
        {status === 'error' ? c.sampleError : playing ? c.samplePlaying(voice) : ''}
      </p>
    </div>
  )
}
