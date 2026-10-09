import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CALL_STATES, type CallState, type CallStateKey } from './callMachine'
import { CallView } from './CallView'
import type { ScreenText } from '../../api/calls'
import { COPY, CRISIS, EPIC_MAIN_NUMBER, SHIPPED_SCREEN_TEXT } from './copy'

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
  crisis: [COPY.crisis.en, COPY.crisis.es],
  handoff: [
    COPY.handoff.en('Residential & Day Programs'),
    COPY.handoff.es('Residential & Day Programs'),
    COPY.handoff.recordedEn,
    COPY.handoff.recordedEs,
  ],
  human_needed: [COPY.humanNeeded.en, COPY.humanNeeded.es],
  reconnecting: [COPY.reconnecting.en, COPY.reconnecting.es],
}

function stateFor(key: CallStateKey): CallState {
  if (key === 'on_call') return { key, startedAt: 0 }
  if (key === 'handoff') return { key, handoffTitle: 'Residential & Day Programs' }
  return { key }
}

describe('CallView', () => {
  it.each(CALL_STATES)('renders the %s state with its copy', (key) => {
    renderState(stateFor(key))
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
    expect(screen.getByText(/The clinic's main line/)).toBeInTheDocument()
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

  it('crisis: bilingual alert with 516-227-8255 in both sentences, heading focused, no Call again', () => {
    renderState({ key: 'crisis' })
    const panel = screen.getByTestId('call-state-crisis')
    expect(panel).toHaveAttribute('role', 'alert')
    expect(screen.getByText(CRISIS.en)).toBeInTheDocument()
    expect(screen.getByText(CRISIS.es)).toBeInTheDocument()
    expect(CRISIS.en).toContain('516-227-8255')
    expect(CRISIS.es).toContain('516-227-8255')
    expect(screen.getByRole('link', { name: '516-227-8255' })).toHaveAttribute('href', 'tel:5162278255')
    expect(screen.getByTestId('call-crisis-heading')).toHaveFocus()
    expect(screen.queryByTestId('call-again')).toBeNull()
    expect(screen.queryByTestId('call-retry')).toBeNull()
  })

  it('handoff: title only, honest wording, Call again focused', () => {
    const handlers = renderState({ key: 'handoff', handoffTitle: 'Residential & Day Programs' })
    expect(screen.getByText('Your request is for Residential & Day Programs.')).toBeInTheDocument()
    expect(screen.getByText('Su solicitud es para Residential & Day Programs.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/connecting|transfer|call you back|\d{4}/i)
    const again = screen.getByTestId('call-again')
    expect(again).toHaveFocus()
    again.click()
    expect(handlers.onReset).toHaveBeenCalledOnce()
  })

  it('human needed: bilingual with the main line and Call again', () => {
    renderState({ key: 'human_needed' })
    expect(screen.getByText(/The clinic's main line/)).toBeInTheDocument()
    expect(screen.getByTestId('call-again')).toHaveFocus()
  })
})

describe('CallView language', () => {
  const ONE_LANGUAGE = [
    ['ended', COPY.ended.es, COPY.ended.en],
    ['human_needed', COPY.humanNeeded.es, COPY.humanNeeded.en],
    ['handoff', COPY.handoff.recordedEs, COPY.handoff.recordedEn],
    ['reconnecting', COPY.reconnecting.es, COPY.reconnecting.en],
  ] as const

  it.each(ONE_LANGUAGE)('%s in Spanish shows only Spanish', (key, es, en) => {
    renderState({ ...stateFor(key), language: 'es' })
    expect(screen.getByText(es)).toBeInTheDocument()
    expect(screen.queryByText(en)).toBeNull()
  })

  it.each(ONE_LANGUAGE)('%s in English shows only English', (key, es, en) => {
    renderState({ ...stateFor(key), language: 'en' })
    expect(screen.getByText(en)).toBeInTheDocument()
    expect(screen.queryByText(es)).toBeNull()
  })

  it.each(['en', 'es', null])('crisis is always EN and ES (language %s)', (language) => {
    renderState({ key: 'crisis', language })
    for (const text of [COPY.crisis.en, COPY.crisis.es, CRISIS.en, CRISIS.es])
      expect(screen.getByText(text)).toBeInTheDocument()
  })

  it.each(['mic_denied', 'unavailable'] as const)('%s stays bilingual', (key) => {
    renderState({ key, language: 'es' })
    const copy = key === 'mic_denied' ? COPY.micDenied : COPY.unavailable
    expect(screen.getByText(copy.en)).toBeInTheDocument()
    expect(screen.getByText(copy.es)).toBeInTheDocument()
  })

  it('reconnecting keeps End call', () => {
    const handlers = renderState({ key: 'reconnecting', startedAt: 0 })
    screen.getByTestId('call-end').click()
    expect(handlers.onEnd).toHaveBeenCalled()
  })
})

describe('CallView screen text (T-CALLER)', () => {
  const AR = {
    code: 'ar',
    name: 'العربية',
    dir: 'rtl' as const,
    lines: {
      ended: 'انتهت المكالمة.',
      crisis: 'تم إيقاف هذه المكالمة. يُرجى طلب المساعدة الآن.',
      crisis_help: 'إذا كنت في أزمة: اتصل بالرقم 911 أو 516-227-8255.',
      handoff_title: 'طلبك موجّه إلى {title}.',
      handoff_recorded: 'تم تسجيل طلبك لموظفي العيادة. انتهت المكالمة.',
      human_needed_screen: 'يحتاج أحد موظفي العيادة إلى مساعدتك في هذا الأمر.',
      main_line_label: 'الخط الرئيسي للعيادة',
      unavailable: 'لا يمكننا استقبال المكالمات الآن.',
      mic_denied: 'الميكروفون محظور.',
    },
  }
  const WITH_AR: ScreenText = { ...SHIPPED_SCREEN_TEXT, languages: [...SHIPPED_SCREEN_TEXT.languages, AR] }

  function renderWith(state: CallState, screenText: ScreenText | null) {
    const handlers = { onCall: vi.fn(), onEnd: vi.fn(), onReset: vi.fn(), onUnlockAudio: vi.fn() }
    render(<CallView state={state} elapsedSeconds={0} {...handlers} screenText={screenText} />)
  }

  const AR_ONLY = [
    ['ended', [AR.lines.ended], [COPY.ended.en, COPY.ended.es]],
    ['human_needed', [AR.lines.human_needed_screen, AR.lines.main_line_label], [COPY.humanNeeded.en, COPY.humanNeeded.es]],
    [
      'handoff',
      ['طلبك موجّه إلى Residential & Day Programs.', AR.lines.handoff_recorded],
      [COPY.handoff.recordedEn, COPY.handoff.recordedEs],
    ],
  ] as const

  it.each(AR_ONLY)('an ar call shows %s only in Arabic, right to left', (key, arabic, others) => {
    renderWith({ ...stateFor(key), language: 'ar' }, WITH_AR)
    for (const text of arabic) {
      const el = screen.getByText(text)
      expect(el.closest('[lang]')).toHaveAttribute('lang', 'ar')
      expect(el.closest('[dir]')).toHaveAttribute('dir', 'rtl')
    }
    for (const text of others) expect(screen.queryByText(text)).toBeNull()
    expect(screen.queryByText(EPIC_MAIN_NUMBER.label)).toBeNull()
  })

  it.each(['fr', 'xx', null])('an unknown or disabled language (%s) shows every enabled language', (language) => {
    renderWith({ key: 'ended', language }, WITH_AR)
    const blocks = [COPY.ended.en, COPY.ended.es, AR.lines.ended].map((t) => screen.getByText(t))
    expect(blocks.map((b) => b.getAttribute('lang'))).toEqual(['en', 'es', 'ar'])
    expect(blocks[2]).toHaveAttribute('dir', 'rtl')
  })

  it('ar is shown as every enabled language when the server did not enable it', () => {
    renderWith({ key: 'ended', language: 'ar' }, SHIPPED_SCREEN_TEXT)
    expect(screen.getByText(COPY.ended.en)).toBeInTheDocument()
    expect(screen.getByText(COPY.ended.es)).toBeInTheDocument()
  })

  it('pre-call errors show every enabled language', () => {
    renderWith({ key: 'mic_denied', language: 'ar' }, WITH_AR)
    for (const text of [COPY.micDenied.en, COPY.micDenied.es, AR.lines.mic_denied])
      expect(screen.getByText(text)).toBeInTheDocument()
  })

  it.each(['ar', 'en', null])(
    'crisis (language %s) shows the numbers first, then English, Spanish and Arabic, compactly',
    (language) => {
      renderWith({ key: 'crisis', language }, WITH_AR)
      const panel = screen.getByTestId('call-state-crisis')
      const numbers = screen.getByTestId('call-crisis-numbers')
      // Visible without scrolling at 393x852: the tap-to-call row is the panel's first child,
      // ahead of every sentence, and is one wrapping row of links.
      expect(panel.firstElementChild).toBe(numbers)
      expect(numbers).toHaveClass('call-numbers')
      expect(screen.getByRole('link', { name: '911' })).toHaveAttribute('href', 'tel:911')
      expect(screen.getByRole('link', { name: '516-227-8255' })).toHaveAttribute('href', 'tel:5162278255')
      const blocks = [...panel.children].slice(1)
      expect(blocks.map((b) => b.getAttribute('lang'))).toEqual(['en', 'es', 'ar'])
      expect(blocks[2]).toHaveAttribute('dir', 'rtl')
      expect(blocks[0]).toHaveTextContent(COPY.crisis.en)
      expect(blocks[1]).toHaveTextContent(COPY.crisis.es)
      expect(blocks[2]).toHaveTextContent(AR.lines.crisis)
      expect(blocks[2]).toHaveTextContent(AR.lines.crisis_help)
      expect(screen.getByTestId('call-crisis-heading')).toHaveFocus()
    },
  )

  it('keeps every number in Arabic text left to right, so 516-227-8255 is not drawn reversed', () => {
    renderWith({ key: 'crisis', language: 'ar' }, WITH_AR)
    const ar = screen.getByTestId('call-crisis-ar')
    const kept = [...ar.querySelectorAll('bdi[dir="ltr"]')].map((b) => b.textContent)
    expect(kept).toEqual(['911', '516-227-8255'])
    expect(ar).toHaveTextContent(AR.lines.crisis_help)
    // English text is left as it is.
    expect(screen.getByTestId('call-crisis-en').querySelector('bdi')).toBeNull()
  })

  it('uses the crisis numbers the server returns as tap-to-call links', () => {
    renderWith({ key: 'crisis' }, { ...WITH_AR, crisis_numbers: ['988'] })
    expect(screen.getByRole('link', { name: '988' })).toHaveAttribute('href', 'tel:988')
  })

  it.each([null, undefined])('without screen text (%s) the shipped EN/ES text shows', (screenText) => {
    renderWith({ key: 'crisis' }, screenText ?? null)
    for (const text of [COPY.crisis.en, COPY.crisis.es, CRISIS.en, CRISIS.es])
      expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '911' })).toBeInTheDocument()
  })
})
