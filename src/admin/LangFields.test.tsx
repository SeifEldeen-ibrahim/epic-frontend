import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LangPhraseList, LangTextField, SET_BY_US } from './LangFields'

describe('T-LANGFIELDS: per-language fields', () => {
  it('an Arabic field has lang="ar" dir="rtl" on its input, and the label has no dir="rtl"', () => {
    render(
      <LangTextField
        code="ar"
        dir="rtl"
        lineKey="after_hours_note"
        label="Closed now"
        help="Said when someone calls outside opening hours."
        english="We are closed now."
        value=""
        onChange={() => {}}
        error="Arabic: 'Closed now' must keep {next_opening}"
      />,
    )
    const input = screen.getByLabelText('Closed now')
    expect(input.id).toBe('lang-ar-after_hours_note')
    expect(input).toHaveAttribute('lang', 'ar')
    expect(input).toHaveAttribute('dir', 'rtl')
    const label = screen.getByText('Closed now', { selector: 'label' })
    expect(label.closest('[dir="rtl"]')).toBeNull()
    expect(screen.getByText(/must keep/).closest('[dir="rtl"]')).toBeNull()
  })

  it('the "In English" line is shown, left-to-right in English, with the help underneath', () => {
    render(
      <LangTextField code="ar" dir="rtl" lineKey="greeting" label="Greeting" help="Said first." english="Hello." value="" onChange={() => {}} />,
    )
    const en = screen.getByText('In English: Hello.')
    expect(en).toHaveAttribute('lang', 'en')
    expect(en).toHaveAttribute('dir', 'ltr')
    expect(screen.getByText('Said first.')).toBeInTheDocument()
  })

  it('chip remove buttons have aria-labels; floor chips are locked', () => {
    const onChange = vi.fn()
    render(
      <LangPhraseList
        code="es"
        dir="ltr"
        languageName="Spanish"
        label="Crisis phrases"
        floor={['suicidio']}
        additions={['me quiero morir']}
        onChange={onChange}
        enabled
        testId="crisis-es"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: "Remove 'me quiero morir'" }))
    expect(onChange).toHaveBeenCalledWith([])
    expect(screen.getByTestId('crisis-es-locked')).toHaveTextContent(SET_BY_US)
    expect(screen.queryByTestId('crisis-es-kept')).toBeNull()
  })

  it('the "kept" note shows when the language is off', () => {
    render(
      <LangPhraseList
        code="ar"
        dir="rtl"
        languageName="Arabic"
        label="Crisis phrases"
        floor={[]}
        additions={['x']}
        onChange={() => {}}
        enabled={false}
        testId="crisis-ar"
      />,
    )
    expect(screen.getByTestId('crisis-ar-kept')).toHaveTextContent('kept, not used')
  })
})
