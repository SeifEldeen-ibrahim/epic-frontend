import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CALL_STATES, type CallState, type CallStateKey } from './callMachine'
import { CallView } from './CallView'
import { COPY } from './copy'

afterEach(cleanup)

function renderState(state: CallState, elapsed = 83) {
  const handlers = { onCall: vi.fn(), onEnd: vi.fn(), onReset: vi.fn(), onUnlockAudio: vi.fn() }
  render(<CallView state={state} elapsedSeconds={elapsed} {...handlers} />)
  return handlers
}

const EXPECTED_TEXT: Record<CallStateKey, string[]> = {
  idle: [COPY.recorded, COPY.fictional],
  requesting_mic: [COPY.requestingMic],
  mic_denied: [COPY.micDenied.en, COPY.micDenied.es],
  unsupported: [COPY.unsupported.en, COPY.unsupported.es],
  connecting: [COPY.connecting],
  on_call: [COPY.onCall],
  ended: [COPY.ended.en, COPY.ended.es],
  unavailable: [COPY.unavailable.en, COPY.unavailable.es],
}

describe('CallView', () => {
  it.each(CALL_STATES)('renders the %s state with its copy', (key) => {
    renderState(key === 'on_call' ? { key, startedAt: 0 } : { key })
    expect(screen.getByTestId(`call-state-${key}`)).toBeInTheDocument()
    for (const text of EXPECTED_TEXT[key]) expect(screen.getByText(text)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/listening|thinking/i)
  })

  it('shows the insecure-page message for an insecure context', () => {
    renderState({ key: 'unsupported', unsupportedReason: 'insecure' })
    expect(screen.getByText(COPY.insecure.en)).toBeInTheDocument()
    expect(screen.getByText(COPY.insecure.es)).toBeInTheDocument()
  })

  it('offers crisis numbers as tel: links and the main line on the unavailable screen', () => {
    renderState({ key: 'unavailable' })
    expect(screen.getByRole('link', { name: '911' })).toHaveAttribute('href', 'tel:911')
    expect(screen.getByRole('link', { name: '516-227-8255' })).toHaveAttribute('href', 'tel:5162278255')
    expect(screen.getByText(/nearest emergency room/)).toBeInTheDocument()
    expect(screen.getByText(/EPIC's main line/)).toBeInTheDocument()
  })

  it('shows a non-announcing timer, focuses End call and wires its handler', () => {
    const handlers = renderState({ key: 'on_call', startedAt: 0 }, 83)
    const timer = screen.getByRole('timer')
    expect(timer).toHaveTextContent('01:23')
    expect(timer).toHaveAttribute('aria-live', 'off')
    const end = screen.getByTestId('call-end')
    expect(end).toHaveFocus()
    end.click()
    expect(handlers.onEnd).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('call-audio-unlock')).toBeNull()
  })

  it('offers "Tap to hear the agent" when autoplay was blocked', () => {
    const handlers = renderState({ key: 'on_call', startedAt: 0, audioBlocked: true })
    screen.getByTestId('call-audio-unlock').click()
    expect(handlers.onUnlockAudio).toHaveBeenCalledOnce()
  })

  it('disables Call when the microphone is denied', () => {
    renderState({ key: 'mic_denied' })
    expect(screen.getByRole('button', { name: COPY.call })).toBeDisabled()
  })

  it('focuses Call again after a call ends', () => {
    const handlers = renderState({ key: 'ended' })
    const again = screen.getByTestId('call-again')
    expect(again).toHaveFocus()
    again.click()
    expect(handlers.onReset).toHaveBeenCalledOnce()
  })
})
