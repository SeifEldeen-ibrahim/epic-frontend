import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditDialog, type FieldDef } from './EditDialog'

const FIELDS: FieldDef[] = [
  { key: 'key', label: 'Key (lowercase, no spaces)', kind: 'text', required: true, slugFrom: 'label', advanced: true, fixedAfterCreate: true },
  { key: 'label', label: 'Label', kind: 'text', required: true },
  { key: 'terms', label: 'Need words', kind: 'list' },
  { key: 'source', label: 'Note (where this info came from)', kind: 'text' },
]

afterEach(cleanup)

function open(props: Partial<Parameters<typeof EditDialog>[0]> = {}) {
  const onSave = vi.fn()
  render(
    <EditDialog open title="Add" fields={FIELDS} initial={{}} creating saving={false} onSave={onSave} onCancel={() => undefined} testId="d" {...props} />,
  )
  return { onSave, dialog: screen.getByTestId('d') }
}

describe('xxadminformsfixxx: EditDialog', () => {
  it('marks required and optional fields for everyone, screen readers included', () => {
    const { dialog } = open()
    const label = within(dialog).getByTestId('d-label')
    expect(label).toHaveAttribute('aria-required', 'true')
    expect(label.closest('.ui-field')?.querySelector('[data-need="required"]')).toHaveTextContent('*Required')
    expect(within(dialog).getByTestId('d-source')).not.toHaveAttribute('aria-required')
    expect(within(dialog).getByTestId('d-source').closest('.ui-field')?.querySelector('[data-need="optional"]')).toHaveTextContent('(optional)')
    expect(within(dialog).getByTestId('d-confirm')).toBeDisabled()
  })

  it('fills the key from the label until the key is edited, and saves every field', async () => {
    const { dialog, onSave } = open()
    await userEvent.type(within(dialog).getByTestId('d-label'), 'Food Help')
    expect(within(dialog).getByTestId('d-key')).toHaveValue('food_help')
    await userEvent.clear(within(dialog).getByTestId('d-key'))
    await userEvent.type(within(dialog).getByTestId('d-key'), 'food')
    await userEvent.type(within(dialog).getByTestId('d-label'), 's')
    expect(within(dialog).getByTestId('d-key')).toHaveValue('food')
    await userEvent.click(within(dialog).getByTestId('d-confirm'))
    expect(onSave).toHaveBeenCalledWith({ key: 'food', label: 'Food Helps', terms: [], source: '' })
  })

  it('shows a server problem under its field and opens Advanced when the key has one', () => {
    const { dialog } = open({ creating: false, initial: { key: 'food', label: 'Food' }, errors: { key: 'is not allowed here', source: 'is missing' } })
    expect(within(dialog).getByTestId('d-source').closest('.ui-field')).toHaveTextContent('Note is missing')
    expect(within(dialog).getByTestId('d-advanced')).toHaveAttribute('open')
    expect(within(dialog).getByTestId('d-key')).toBeDisabled()
  })
})
