import { describe, expect, it } from 'vitest'
import { blankRecord, describeProblem, missingRequired, plainMessage, rowFieldErrors, slugify } from './problems'

describe('xxadminformsfixxx: problems in plain words', () => {
  it('makes keys from names', () => {
    expect(slugify('Flu Shot Clinic')).toBe('flu_shot_clinic')
    expect(slugify('  Café / Niños  ')).toBe('cafe_ninos')
    expect(slugify('2nd Floor Desk')).toBe('nd_floor_desk')
    expect(slugify('A'.repeat(50), 32)).toHaveLength(32)
  })

  it('starts a new record with every field present', () => {
    const rec = blankRecord([
      { key: 'name', label: 'Name', kind: 'text' },
      { key: 'aliases', label: 'Other names', kind: 'list' },
      { key: 'handled_by', label: 'Handled by', kind: 'select' },
      { key: 'on', label: 'On', kind: 'checkbox' },
    ])
    expect(rec).toEqual({ name: '', aliases: [], handled_by: null, on: false })
  })

  it('lists empty required fields only', () => {
    const fields = [
      { key: 'name', label: 'Name', required: true },
      { key: 'source', label: 'Note (where this info came from)' },
      { key: 'terms', label: 'Words (comma separated)', required: true },
    ]
    expect(missingRequired(fields, { name: ' ', source: '', terms: [] })).toEqual(['Name', 'Words'])
    expect(missingRequired(fields, { name: 'x', terms: ['a'] })).toEqual([])
  })

  it('describes index and key paths, known and unknown messages', () => {
    const labels: Record<string, string> = { source: 'Note (where this info came from)', terms: 'Need words' }
    const opts = { list: 'services', rowLabel: (s: string) => (s === '0' ? 'Row 1 (intake)' : undefined), fieldLabel: (k: string) => labels[k] }
    expect(describeProblem({ document: 'knowledge.services', path: 'services.0.source', message: 'missing' }, opts)).toBe('Row 1 (intake): Note is missing')
    expect(describeProblem({ document: 'knowledge.routing', path: 'roles.front.terms', message: 'contains a crisis phrase' }, { ...opts, list: 'roles' })).toBe(
      'front: Need words contains a crisis phrase',
    )
    expect(describeProblem({ document: 'agents.x', path: '<root>', message: 'missing' })).toBe('This section is missing')
    expect(describeProblem({ document: 'agents.x', path: 'persona', message: 'string_too_short' })).toBe('Persona cannot be empty')
    expect(plainMessage('value_error (each span is open < close)')).toBe('is not valid (each span is open < close)')
    expect(plainMessage('names no active agent')).toBe('names no active agent')
  })

  it('keys row problems by field for the open row only', () => {
    const problems = [
      { document: 'knowledge.services', path: 'services.0.source', message: 'missing' },
      { document: 'knowledge.services', path: 'services.1.name', message: 'missing' },
    ]
    expect(rowFieldErrors(problems, 'services', ['0', 'intake'])).toEqual({ source: 'is missing' })
  })
})
