import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useHealth } from '../../api/health'
import { Button, PageLayout, StatusBadge, type StatusTone } from '../../ui'
import { detectUnsupported } from './callMachine'
import './call.css'

type MicStatus = 'untested' | 'testing' | 'ok' | 'denied' | 'error'

const MIC_LABEL: Record<MicStatus, [StatusTone, string]> = {
  untested: ['warning', 'Not tested'],
  testing: ['warning', 'Listening…'],
  ok: ['ok', 'Working'],
  denied: ['error', 'Blocked'],
  error: ['error', 'Not available'],
}

/** Pre-test check: browser support, secure connection, microphone level, backend reachable. */
export function CheckPage() {
  const [support] = useState(() => detectUnsupported())
  const health = useHealth()
  const [mic, setMic] = useState<MicStatus>('untested')
  const [level, setLevel] = useState(0)
  const cleanup = useRef<() => void>(() => undefined)

  useEffect(() => () => cleanup.current(), [])

  async function testMic() {
    cleanup.current()
    setMic('testing')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      await ctx.resume()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      let frame = 0
      const tick = () => {
        analyser.getByteTimeDomainData(samples)
        let peak = 0
        for (const v of samples) peak = Math.max(peak, Math.abs(v - 128))
        setLevel(Math.min(100, Math.round((peak / 128) * 100)))
        frame = requestAnimationFrame(tick)
      }
      tick()
      setMic('ok')
      cleanup.current = () => {
        cancelAnimationFrame(frame)
        stream.getTracks().forEach((t) => t.stop())
        void ctx.close()
      }
    } catch (error) {
      const name = (error as { name?: unknown } | null)?.name
      setMic(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error')
    }
  }

  const backend: [StatusTone, string] = health.isPending
    ? ['warning', 'Checking…']
    : health.data?.status === 'ok'
      ? ['ok', 'Reachable']
      : ['error', 'Not reachable']
  const [micTone, micText] = MIC_LABEL[mic]

  return (
    <PageLayout title="Call check" data-testid="call-check">
      <h1>Check your setup</h1>
      <div className="call-panel">
        <ul className="call-check-list">
          <li>
            <span>Browser can place calls</span>
            <StatusBadge tone={support === 'no_webrtc' ? 'error' : 'ok'}>
              {support === 'no_webrtc' ? 'No' : 'Yes'}
            </StatusBadge>
          </li>
          <li>
            <span>Secure connection (https)</span>
            <StatusBadge tone={support === 'insecure' ? 'error' : 'ok'}>
              {support === 'insecure' ? 'No' : 'Yes'}
            </StatusBadge>
          </li>
          <li>
            <span>EPIC service</span>
            <StatusBadge tone={backend[0]}>{backend[1]}</StatusBadge>
          </li>
          <li>
            <span>Microphone</span>
            <StatusBadge tone={micTone}>{micText}</StatusBadge>
          </li>
        </ul>
        <meter
          className="call-meter"
          min={0}
          max={100}
          value={level}
          aria-label="Microphone level"
          data-testid="call-check-meter"
        />
        <div className="call-actions">
          <Button variant="secondary" onClick={() => void testMic()} disabled={support !== null}>
            Test microphone
          </Button>
          <Link className="ui-link" to="/call">
            Go to the call page
          </Link>
        </div>
        <p className="call-es">Reaching the voice service itself is only proven by placing a call.</p>
      </div>
    </PageLayout>
  )
}
