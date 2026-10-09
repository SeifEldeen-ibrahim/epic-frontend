import { describe, expect, it } from 'vitest'
import type { ChangeItem } from '../api/config'
import { fieldLabel, formatValue, groupChanges, languageLabel, plainLabel, summarize, type LabelContext } from './changeLabels'

const ctx: LabelContext = {
  names: { agents: { clinic: 'Clinic Intake', desk: 'Receptionist' }, forms: { intake: 'Intake request' }, departments: { billing: 'Billing' } },
  tools: { end_call: 'End the call' },
}

function ch(p: Partial<ChangeItem>): ChangeItem {
  return { area: 'agents', section: null, item: 'desk', item_title: 'Receptionist', kind: 'changed', field: [], before: null, after: null, ...p }
}

/** T-FE-LABELS */
describe('T-FE-LABELS: plain labels for every editor field', () => {
  const cases: [ChangeItem['area'], string | null, string[]][] = [
    ...['title', 'terms', 'handled_by', 'say', 'after_hours_say', 'extension', 'department', 'source'].map((k) => ['departments', 'routing', [k]] as [ChangeItem['area'], string, string[]]),
    ...['name', 'aliases', 'description', 'documents', 'wait_time', 'location', 'directions'].map((k) => ['knowledge', 'services', [k]] as [ChangeItem['area'], string, string[]]),
    ...['label', 'terms', 'referral'].map((k) => ['knowledge', 'referrals', [k]] as [ChangeItem['area'], string, string[]]),
    ['knowledge', 'hours', ['timezone']],
    ['knowledge', 'hours', ['closures']],
    ['knowledge', 'crisis', ['keywords', 'en']],
    ['knowledge', 'never_spoken', ['staff_names']],
    ['knowledge', 'clinic', ['clinical_terms']],
    ['knowledge', 'wording', ['greeting']],
    ['knowledge', 'services', ['status']],
    ...['title', 'persona', 'voice', 'knowledge', 'tools', 'route_targets', 'form', 'archived'].map((k) => ['agents', null, [k]] as [ChangeItem['area'], null, string[]]),
    ['agents', null, ['handoff', 'bridge_say']],
    ['agents', null, ['handoff', 'greeting']],
    ...['title', 'archived', 'never_collect'].map((k) => ['forms', null, [k]] as [ChangeItem['area'], null, string[]]),
    ...['label', 'type', 'required', 'help', 'readback_label', 'values', 'stop_values', 'max_length', 'max_items', 'minimum', 'maximum'].map(
      (k) => ['forms', null, ['fields', 'caller_name', k]] as [ChangeItem['area'], null, string[]],
    ),
  ]

  it('covers the editor keys (guard: not vacuous)', () => {
    expect(cases.length).toBeGreaterThan(40)
  })

  it.each(cases)('%s %s %j has an editor label, not a fallback', (area, section, path) => {
    const text = fieldLabel(area, section, path, () => '<unknown>')
    expect(text).toBeTruthy()
    expect(text).not.toContain('<unknown>')
    expect(text).not.toMatch(/_/)
  })

  it('names form fields and Spanish wording plainly', () => {
    expect(fieldLabel('forms', null, ['fields', 'caller_name', 'label'])).toBe('Field “Caller name” › Label')
    expect(fieldLabel('knowledge', 'wording', ['human_needed_es'])).toBe('A person must help (Spanish)')
    expect(fieldLabel('knowledge', 'hours', ['weekly', 'mon'])).toBe('Opening hours › Monday')
  })
})

describe('T-FE-LABELS: values', () => {
  it('shows references by title and plain words for empty and yes/no', () => {
    expect(formatValue('departments', 'routing', ['handled_by'], null, ctx)).toBe('Department message')
    expect(formatValue('departments', 'routing', ['handled_by'], 'clinic', ctx)).toBe('Agent: Clinic Intake')
    expect(formatValue('answering', null, [], 'desk', ctx)).toBe('Receptionist')
    expect(formatValue('agents', null, ['form'], 'intake', ctx)).toBe('Intake request')
    expect(formatValue('agents', null, ['route_targets'], ['billing', 'clinic'], ctx)).toBe('Billing, Clinic Intake')
    expect(formatValue('agents', null, ['tools'], ['end_call', 'lookup_service'], ctx)).toBe('End the call, Lookup service')
    expect(formatValue('agents', null, ['archived'], true, ctx)).toBe('Yes')
    expect(formatValue('agents', null, ['archived'], false, ctx)).toBe('No')
    expect(formatValue('knowledge', 'services', ['location'], '', ctx)).toBe('Nothing')
    expect(formatValue('knowledge', 'hours', ['weekly', 'mon'], ['08:30', '21:00'], ctx)).toBe('08:30–21:00')
    expect(formatValue('knowledge', 'hours', ['weekly', 'sun'], null, ctx)).toBe('Closed')
    expect(formatValue('knowledge', 'services', ['status'], 'APPROVED', ctx)).toBe('Approved by the clinic')
    expect(formatValue('agents', null, ['knowledge'], [{ topic: 'Parking', text: 'Free on site.' }], ctx)).toBe('Parking — Free on site.')
  })
})

describe('T-FE-LABELS: grouping', () => {
  it('groups by page in menu order with before/after, word-list deltas and long text', () => {
    const groups = groupChanges(
      [
        ch({ field: ['persona'], before: 'Short.', after: 'x'.repeat(200) }),
        ch({ field: ['voice'], before: 'marin', after: 'cedar' }),
        ch({ area: 'departments', section: 'routing', item: 'intake', item_title: 'Clinic Intake', field: ['handled_by'], before: null, after: 'clinic' }),
        ch({ area: 'knowledge', section: 'services', item: 'autism', item_title: 'Autism evaluation', kind: 'added', after: { key: 'autism', name: 'Autism evaluation', description: 'Full evaluation.' } }),
        ch({ area: 'knowledge', section: 'crisis', item: null, item_title: null, field: ['keywords', 'en'], before: ['a'], after: ['a', 'b'] }),
        ch({ area: 'answering', section: null, item: null, item_title: null, before: 'desk', after: 'clinic' }),
      ],
      ctx,
    )
    expect(groups.map((g) => g.title)).toEqual(['Who answers calls', 'Knowledge', 'Departments', 'Agents'])
    const answering = groups[0].items[0].lines[0]
    expect([answering.before, answering.after]).toEqual(['Receptionist', 'Clinic Intake'])
    const [service, crisis] = groups[1].items
    expect(service.title).toBe('Services › Autism evaluation')
    expect(service.kind).toBe('added')
    expect(service.lines.map((l) => [l.label, l.after])).toEqual([
      ['Name', 'Autism evaluation'],
      ['Description', 'Full evaluation.'],
    ])
    expect(crisis.lines[0].label).toBe('Crisis phrases (English)')
    expect(crisis.lines[0].listAdded).toEqual(['b'])
    const dept = groups[2].items[0]
    expect(dept.title).toBe('Clinic Intake')
    expect([dept.lines[0].label, dept.lines[0].before, dept.lines[0].after]).toEqual(['Handled by', 'Department message', 'Agent: Clinic Intake'])
    const agent = groups[3].items[0]
    expect(agent.lines[0].long).toBe(true)
    expect([agent.lines[1].label, agent.lines[1].before, agent.lines[1].after, agent.lines[1].long]).toEqual(['Voice', 'marin', 'cedar', false])
  })
})

describe('T-FE-LABELS: summary sentence', () => {
  it('counts items and names a single one', () => {
    expect(
      summarize([
        { area: 'knowledge', section: 'services', kind: 'added', count: 3, titles: ['A', 'B', 'C'] },
        { area: 'departments', section: 'routing', kind: 'changed', count: 1, titles: [] },
        { area: 'agents', section: null, kind: 'changed', count: 1, titles: ['Receptionist'] },
        { area: 'knowledge', section: 'hours', kind: 'changed', count: 1, titles: [] },
      ]),
    ).toBe('3 services added, 1 department changed, agent Receptionist changed, Hours & closures changed')
    expect(summarize([])).toBe('Nothing changed.')
  })
})

describe('T-LANG-PAGES: change labels name any language', () => {
  it('reads "(Arabic)"', () => {
    expect(languageLabel('Closed now', 'Arabic')).toBe('Closed now (Arabic)')
    expect(plainLabel('Closed now (Arabic)')).toBe('Closed now (Arabic)')
    expect(plainLabel('Line the previous agent says (Spanish)')).toBe('Line the previous agent says (Spanish)')
  })
})
