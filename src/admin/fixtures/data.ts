// FIXTURE-ONLY-7f3a — dev-only, obviously fictional admin data for screenshots. Never shipped to production.
import type {
  AuditListResponse,
  CallDetail,
  CallListResponse,
  ExportPendingResponse,
  FollowUpResponse,
  QueueResponse,
  ReportsResponse,
  TimelineEntry,
  VoiceModeResponse,
} from '../../api/admin'
import type { StaffMe } from '../../api/auth'
import type { Catalog, Compiled, ConfigState, DiffResponse, LanguagesCatalog, SectionResponse } from '../../api/config'
import type { components } from '../../api/schema'

type AgentListResponse = components['schemas']['AgentListResponse']
type FormListResponse = components['schemas']['FormListResponse']
type VersionListResponse = components['schemas']['VersionListResponse']
type HomeResponse = components['schemas']['HomeResponse']

/** Runtime marker; present only in the dev-only fixture chunk. */
export const FIXTURE_MARKER = 'FIXTURE-ONLY-7f3a'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const at = (minute: number) => new Date(Date.UTC(2026, 0, 5, 9, minute)).toISOString()

export const FX_CALL_ID = id(1)

export const fxAdmin: StaffMe = {
  id: id(900),
  email: 'fixture.admin@example.test',
  display_name: 'Fixture Admin (fictional)',
  must_change_password: false,
  role: 'admin',
}
export const fxReviewer: StaffMe = { ...fxAdmin, id: id(901), email: 'fixture.reviewer@example.test', display_name: 'Fixture Reviewer (fictional)', role: 'reviewer' }
export const fxMustChange: StaffMe = { ...fxAdmin, id: id(902), must_change_password: true }

const categories = ['new_matter', 'billing', 'existing_case', 'general', 'documents', 'scheduling']
const languages = ['en', 'es', 'en', 'fr', 'en', 'es']

export const fxQueue: QueueResponse = {
  items: categories.map((cat, i) => ({
    form_id: id(100 + i),
    call_id: id(1 + i),
    submitted_at: at(i * 7),
    after_hours_queued: i % 3 === 0,
    language: languages[i],
    inquiry_category: cat,
    route_role: i % 2 ? 'intake' : 'paralegal',
    flag_counts: { open: i === 1 ? 2 : 0, carried: i === 4 ? 1 : 0, acknowledged: 0, resolved: i % 2 },
  })),
}

export const fxFollowUp: FollowUpResponse = {
  items: [0, 1, 2, 3].map((i) => ({
    call_id: id(20 + i),
    started_at: at(i * 11),
    ended_at: at(i * 11 + 4),
    language: languages[i],
    outcome: (['human_needed', 'crisis', 'abandoned', 'error'] as const)[i],
    form_status: i === 2 ? null : 'incomplete',
    stated_name: `Test Caller ${i + 1} (fictional)`,
    stated_reason: 'Fixture reason — not a real caller',
  })),
}

const outcomes = ['routed', 'clinic_form', 'referred', 'human_needed', 'crisis', 'abandoned', 'department_handoff', 'routed'] as const

export const fxCalls: CallListResponse = {
  next_cursor: 'fixture-cursor',
  items: outcomes.map((outcome, i) => ({
    id: id(1 + i),
    started_at: at(i * 5),
    ended_at: i === 0 ? null : at(i * 5 + 3),
    status: i === 0 ? 'live' : 'ended',
    outcome: i === 0 ? null : outcome,
    agent_version: 'fixture-v1',
    follow_up_status: outcome === 'human_needed' ? 'needed' : 'none',
    form_status: outcome === 'clinic_form' ? 'awaiting_approval' : null,
    inquiry_category: categories[i % categories.length],
    language: languages[i % languages.length],
    open_flags: i === 1 ? 1 : 0,
    route_role: 'intake',
    tester_label: 'fixture',
  })),
}
export const fxCallsEmpty: CallListResponse = { items: [], next_cursor: null }

export const fxReports: ReportsResponse = {
  agent_version: null,
  date_from: '2026-01-01',
  date_to: '2026-01-07',
  period: 'day',
  total_calls: 42,
  outcomes: [
    { outcome: 'routed', inquiry_category: 'new_matter', count: 18 },
    { outcome: 'clinic_form', inquiry_category: 'billing', count: 11 },
    { outcome: 'human_needed', inquiry_category: 'general', count: 7 },
    { outcome: 'abandoned', inquiry_category: null, count: 6 },
  ],
  routing_mix: [
    { route_role: 'intake', count: 25 },
    { route_role: 'paralegal', count: 17 },
  ],
  latency: [{ agent_version: 'fixture-v1', turns: 310, p50_ms: 640, p90_ms: 1180 }],
  delegation: [{ agent_version: 'fixture-v1', actions: 54, p50_ms: 900, p90_ms: 2100 }],
  unmet_demand: [{ category: 'immigration', count: 3, period_start: '2026-01-01' }],
  gate_results: [
    {
      kind: 'live',
      run_at: at(50),
      git_sha: 'fixture0',
      story_id: 'live-smoke',
      repeat: null,
      mode: 'live',
      passed: true,
      stop: 'routed',
      turns_before_route: 4,
      duration_s: 61.2,
      spend_usd: 0.41,
      findings: [],
    },
    {
      kind: 'harness',
      run_at: at(40),
      git_sha: 'fixture0',
      story_id: 'story-billing-es',
      repeat: 2,
      mode: 'audio',
      passed: false,
      stop: 'max_turns',
      turns_before_route: null,
      duration_s: 88.4,
      spend_usd: 0.73,
      findings: [{ table: 'flags', key_name: 'missing_contact', count: 1 }],
    },
    {
      kind: 'harness',
      run_at: at(30),
      git_sha: 'fixture0',
      story_id: 'story-new-matter',
      repeat: 1,
      mode: 'fake',
      passed: true,
      stop: 'routed',
      turns_before_route: 5,
      duration_s: 12.9,
      spend_usd: null,
      findings: [],
    },
    {
      kind: 'gate',
      run_at: at(20),
      git_sha: 'fixture0',
      story_id: null,
      repeat: null,
      mode: null,
      passed: true,
      stop: null,
      turns_before_route: null,
      duration_s: 240.0,
      spend_usd: 1.95,
      findings: [
        { table: 'calls', key_name: 'outcome', count: 3 },
        { table: 'forms', key_name: 'status', count: 2 },
      ],
    },
  ],
  unapproved: [
    { file: 'content/greeting.en.md', status: 'placeholder' },
    { file: 'content/after_hours.es.md', status: 'awaiting_review' },
  ],
}

/** Empty reports: no calls, no gate results, everything approved. */
export const fxReportsEmpty: ReportsResponse = {
  ...fxReports,
  total_calls: 0,
  outcomes: [],
  routing_mix: [],
  latency: [],
  delegation: [],
  unmet_demand: [],
  gate_results: [],
  unapproved: [],
}

export const fxExports: ExportPendingResponse = {
  items: [0, 1, 2, 3, 4].map((i) => ({
    call_id: id(40 + i),
    form_id: id(140 + i),
    caller_relationship: i % 2 ? 'self' : 'family member',
    decided_at: at(i * 9 + 30),
    submitted_at: at(i * 9),
    inquiry_category: categories[i],
    language: languages[i],
  })),
}

const auditActions = ['login', 'view_call', 'edit_field', 'approve', 'reject', 'export', 'play_recording', 'logout'] as const
export const fxAudit: AuditListResponse = {
  next_cursor: null,
  items: auditActions.map((action, i) => ({
    id: 5000 + i,
    action,
    actor: 'staff',
    at: at(i * 3),
    staff_email: fxAdmin.email,
    target: action === 'login' || action === 'logout' ? null : id(1 + (i % 3)),
    detail: { fixture: true },
  })),
}

function timeline(flagStatus: 'open' | 'resolved'): TimelineEntry[] {
  const turns: TimelineEntry[] = [
    ['agent', 'Hello, this is a fictional fixture call. How can I help?'],
    ['caller', 'Hi, I am Test Caller (fictional) and I have a billing question.'],
    ['agent', 'Thanks. Can I take a callback number?'],
    ['caller', 'Sure, it is 555-0100 (fictional).'],
  ].map(([speaker, text], i) => ({
    entry_type: 'turn' as const,
    seq: i + 1,
    speaker: speaker as 'agent' | 'caller',
    text,
    language: 'en',
    at: at(i),
    started_at: at(i),
    ended_at: at(i),
    latency_ms: speaker === 'agent' ? 600 + i * 40 : null,
  }))
  return [
    ...turns.slice(0, 2),
    {
      entry_type: 'action',
      id: id(300),
      kind: 'function_call',
      name: 'lookup_category',
      at: at(2),
      created_at: at(2),
      delegation_ms: 850,
      args: { query: 'billing (fixture)' },
      result: { category: 'billing' },
    },
    ...turns.slice(2),
    {
      entry_type: 'flag',
      id: id(400),
      kind: 'typo',
      status: flagStatus,
      detail: 'Fixture flag: callback number spelled oddly',
      form_field: 'callback_number',
      at: at(5),
      created_at: at(5),
      resolved_at: flagStatus === 'resolved' ? at(6) : null,
      resolved_by: flagStatus === 'resolved' ? 'auto' : null,
    },
  ]
}

const baseDetail: CallDetail = {
  call: {
    id: FX_CALL_ID,
    after_hours: false,
    agent_version: 'fixture-v1',
    voice_mode: 'gpt-live',
    channel: 'web',
    clarify_turns: 1,
    started_at: at(0),
    ended_at: at(6),
    status: 'ended',
    outcome: 'clinic_form',
    follow_up_status: 'none',
    inquiry_category: 'billing',
    language: 'en',
    route_role: 'intake',
    stated_name: 'Test Caller (fictional)',
    stated_reason: 'Fixture billing question',
    tester_label: 'fixture',
  },
  form: {
    id: id(100),
    status: 'awaiting_approval',
    schema_version: 'fixture-1',
    after_hours_queued: false,
    submitted_at: at(6),
    decided_at: null,
    decided_by_email: null,
    exported_at: null,
    reject_reason: null,
    caller_relationship: 'self',
    callback_consent: true,
    callback_number: '555-0100',
    insurance_carrier_verbatim: 'Fictional Mutual',
    documents_held: ['fixture invoice'],
    fields: { preferred_time: 'Weekday mornings (fictional)' },
  },
  field_history: [
    { at: at(5), field: 'callback_number', old: '555-01OO', new: '555-0100', source: 'luna', staff_email: null },
  ],
  recording: { available: true, missing: 0, reason: null, segments: 3, total_bytes: 482000 },
  sessions: [{ seq: 1, agent_package: 'switchboard', voice: 'fixture-voice', started_at: at(0), ended_at: at(6), end_reason: 'hangup' }],
  timeline: timeline('resolved'),
}

export const fxDetail = {
  form: baseDetail,
  flagsOpen: { ...baseDetail, timeline: timeline('open') } satisfies CallDetail,
  noForm: { ...baseDetail, form: null, call: { ...baseDetail.call, outcome: 'crisis' } } satisfies CallDetail,
  live: {
    ...baseDetail,
    call: { ...baseDetail.call, status: 'live', ended_at: null, outcome: null },
    form: baseDetail.form ? { ...baseDetail.form, status: 'being_filled', submitted_at: null } : null,
  } satisfies CallDetail,
  realtime: {
    ...baseDetail,
    call: { ...baseDetail.call, agent_version: 'fixture-v1+rt-abc123', voice_mode: 'realtime' },
    recording: { available: false, missing: 0, reason: null, segments: 0, total_bytes: 0 },
  } satisfies CallDetail,
  recordingUnavailable: {
    ...baseDetail,
    recording: { available: false, missing: 3, reason: 'fixture: no segments stored', segments: 0, total_bytes: 0 },
  } satisfies CallDetail,
}

export const fxVoiceMode: VoiceModeResponse = {
  mode: 'gpt-live',
  stored: true,
  updated_at: '2026-10-07T12:00:00+00:00',
}

// --- admin-knowledge: config fixtures (fictional) -----------------------------------------------

export const fxConfigState: ConfigState = {
  active_seq: 3,
  active_label: 'cfg-3-fx1a2b3c',
  entry_agent: 'switchboard',
  draft_based_on_seq: 3,
  draft_changed_sections: ['knowledge.routing', 'agents'],
  draft_problems: [],
  draft_updated_at: at(10),
  stale: false,
  drift: false,
  fallback_problems: null,
  reload_pending: false,
  can_edit: true,
}
export const fxConfigProblems: ConfigState = {
  ...fxConfigState,
  draft_problems: [
    { document: 'agents.fixture_desk', path: 'voice', message: 'must differ from every agent that redirects here' },
    { document: 'forms.fixture_form', path: 'fields.member_no', message: 'names something the clinic never collects' },
  ],
}
export const fxConfigBanners: ConfigState = {
  ...fxConfigState,
  stale: true,
  drift: true,
  reload_pending: true,
  fallback_problems: [{ document: 'agents.fixture_desk', path: 'voice', message: 'unknown voice' }],
}
export const fxConfigReviewer: ConfigState = { ...fxConfigState, can_edit: false }
/** Nothing waiting to go live. */
export const fxConfigClean: ConfigState = { ...fxConfigState, draft_changed_sections: [] }
/** A blank start: nobody answers calls yet. */
export const fxConfigNobody: ConfigState = { ...fxConfigState, entry_agent: null, draft_changed_sections: [] }

const noSteps = {
  basics: false,
  departments: false,
  forms: false,
  specialists: false,
  front_desk: false,
  answering: false,
  live: false,
  test_call: false,
}
export const fxHomeBlank: HomeResponse = {
  calls_today: 0,
  forms_waiting: 0,
  line_live: false,
  answering_agent: null,
  setup: noSteps,
  can_edit: true,
}
export const fxHomePartial: HomeResponse = {
  ...fxHomeBlank,
  setup: { ...noSteps, basics: true, departments: true, specialists: true },
}
export const fxHomeLive: HomeResponse = {
  calls_today: 7,
  forms_waiting: 2,
  line_live: true,
  answering_agent: 'Front desk',
  setup: { basics: true, departments: true, forms: true, specialists: true, front_desk: true, answering: true, live: true, test_call: true },
  can_edit: true,
}

export const fxCatalog: Catalog = {
  voices: ['marin', 'cedar', 'sage'],
  tools: [
    { name: 'route_to', description: 'Redirect: tell the caller who handles their need, or hand them to another agent.', group: 'redirect', locked: false },
    { name: 'give_referral', description: "Referral: give the approved referral when the clinic doesn't offer something.", group: 'info', locked: false },
    { name: 'lookup_service', description: "Service details: answer questions about the clinic's services from approved text.", group: 'info', locked: false },
    { name: 'save_fields', description: 'Fill a form: save each detail the caller gives.', group: 'form', locked: false },
    { name: 'confirm_callback', description: 'Fill a form: confirm the callback number and permission to phone.', group: 'form', locked: false },
    { name: 'submit_form', description: 'Fill a form: submit the request for staff review.', group: 'form', locked: false },
    { name: 'end_call', description: 'End the call (always on).', group: 'end', locked: true },
    { name: 'verify_patient', description: 'Check who the caller is (phone, name, date of birth)', group: 'booking', locked: false },
    { name: 'find_slots', description: 'Find open appointment times', group: 'booking', locked: false },
    { name: 'book_appointment', description: 'Book an appointment', group: 'booking', locked: false },
    { name: 'list_my_appointments', description: "List the caller's appointments", group: 'booking', locked: false },
    { name: 'reschedule_appointment', description: 'Move an appointment', group: 'booking', locked: false },
    { name: 'cancel_appointment', description: 'Cancel an appointment', group: 'booking', locked: false },
  ],
  field_types: [
    { type: 'text', label: 'Text', options: ['max_length'] },
    { type: 'enum', label: 'Choice', options: ['values', 'stop_values'] },
    { type: 'bool', label: 'Yes / no', options: [] },
    { type: 'list', label: 'List', options: ['max_items', 'max_length'] },
    { type: 'number', label: 'Number (up to 4 digits)', options: ['minimum', 'maximum'] },
    { type: 'date', label: 'Date', options: [] },
  ],
  knowledge_sections: ['routing', 'services', 'referrals', 'hours', 'crisis', 'never_spoken', 'wording', 'clinic'],
  floor: {
    crisis: { en: ['fixture crisis phrase'], es: ['frase de crisis ficticia'] },
    crisis_agency: { fixture_agency: ['FXA'] },
    crisis_instruction: 'If you are in crisis, call the fictional crisis line.',
    crisis_numbers: ['000'],
    staff_names: ['Fixture Staffer'],
    denylist: ['fixture banned term'],
    denylist_case_sensitive: ['FX'],
    clinical_terms: ['fixture clinical term'],
    clinical_exclusions: ['fixture not clinical'],
    never_collect_terms: ['fixture secret'],
    never_collect_keys: ['ssn', 'member_id'],
  },
  limits: { persona_max: 1500, knowledge_items_max: 40, knowledge_item_max: 500, instruction_max: 24000, form_fields_max: 30, handoff_cap: 3 },
}

export const fxRouting: SectionResponse = {
  name: 'knowledge.routing',
  value: {
    status: 'UNAPPROVED',
    entitlement_words: ['fixture benefit'],
    roles: [
      { role: 'fixture_dept', title: 'Fixture Department', terms: ['fixture need'], say: 'That is handled by the Fixture Department.', after_hours_say: 'That is handled by the Fixture Department, which is closed now.', handled_by: null, extension: null, department: null, source: 'fixture' },
      { role: 'fixture_desk', title: 'Fixture Desk', terms: ['fixture desk'], say: 'Fixture Desk.', after_hours_say: 'Fixture Desk (closed).', handled_by: 'fixture_desk', extension: null, department: null, source: 'fixture' },
    ],
  },
  draft_problems: [],
}

export const fxAgents: AgentListResponse = {
  entry_agent: 'switchboard',
  agents: [
    { name: 'switchboard', title: 'Receptionist', voice: 'marin', tools: ['route_to', 'give_referral', 'lookup_service', 'end_call'], route_targets: ['fixture_dept', 'fixture_desk'], form: null, takes_calls_for: [], archived: false, entry: true, other_languages: [] },
    { name: 'fixture_desk', title: 'Fixture Desk', voice: 'sage', tools: ['save_fields', 'confirm_callback', 'submit_form', 'end_call'], route_targets: [], form: 'fixture_form', takes_calls_for: ['fixture_desk'], archived: false, entry: false, other_languages: [{ code: 'es', filled: true }] },
  ],
}

export const fxAgentDesk: SectionResponse = {
  name: 'agents.fixture_desk',
  value: {
    name: 'fixture_desk',
    title: 'Fixture Desk',
    persona: 'A fictional desk used for screenshots. Friendly and brief.',
    knowledge: [{ topic: 'Fixture hours', text: 'The fixture desk works fictional hours.' }],
    voice: 'sage',
    tools: ['save_fields', 'confirm_callback', 'submit_form', 'end_call'],
    route_targets: [],
    form: 'fixture_form',
    handoff: { bridge_say: 'Passing you to the Fixture Desk now.', greeting: 'Greet the caller and ask your first question.' },
    archived: false,
  },
  draft_problems: [],
}
export const fxAgentSwitchboard: SectionResponse = {
  name: 'agents.switchboard',
  value: {
    name: 'switchboard',
    title: 'Receptionist',
    persona: 'The fictional receptionist used for screenshots.',
    knowledge: [],
    voice: 'marin',
    tools: ['route_to', 'give_referral', 'lookup_service', 'end_call'],
    route_targets: ['fixture_dept', 'fixture_desk'],
    form: null,
    handoff: null,
    archived: false,
  },
  draft_problems: [],
}
export const fxCompiled: Compiled = {
  name: 'fixture_desk',
  gpt_live_prompt: "You are the clinic's Fixture Desk on the clinic's test phone line. (fixture text)",
  luna_rules: "You act for the clinic's Fixture Desk on the clinic's test phone line. (fixture text)",
  realtime_prompt: 'REALTIME MODE. (fixture text)',
}

export const fxForms: FormListResponse = {
  forms: [{ name: 'fixture_form', title: 'Fixture request', status: 'UNAPPROVED', fields: 2, used_by: ['fixture_desk'], archived: false }],
}
export const fxFormsEmpty: FormListResponse = { forms: [] }
export const fxForm: SectionResponse = {
  name: 'forms.fixture_form',
  value: {
    name: 'fixture_form',
    title: 'Fixture request',
    status: 'UNAPPROVED',
    source: 'fixture',
    fields: {
      preferred_day: { type: 'enum', values: ['monday', 'tuesday'], required: true, label: 'Preferred day', help: 'the weekday the caller prefers.', readback_label: 'your preferred day' },
      wants_brochure: { type: 'bool', required: true, label: 'Brochure', help: 'true if the caller wants a brochure.', readback_label: 'whether you want a brochure' },
    },
    guard_keys: [],
    never_collect: [],
    archived: false,
  },
  draft_problems: [],
}

export const fxVersions: VersionListResponse = {
  versions: [
    {
      seq: 3,
      label: 'cfg-3-fx1a2b3c',
      source: 'admin',
      rolled_back_from: null,
      note: 'Fixture desk added',
      created_by: 'Fixture Admin (fictional)',
      created_at: at(20),
      active: true,
      summary: [
        { area: 'knowledge', section: 'services', kind: 'added', count: 3, titles: ['Autism evaluation', 'Speech therapy', 'Hearing check'] },
        { area: 'departments', section: 'routing', kind: 'changed', count: 1, titles: ['Fixture Intake'] },
        { area: 'agents', section: null, kind: 'changed', count: 1, titles: ['Fixture Receptionist'] },
      ],
    },
    {
      seq: 2,
      label: 'cfg-2-fx4d5e6f',
      source: 'rollback',
      rolled_back_from: 1,
      note: null,
      created_by: 'Fixture Admin (fictional)',
      created_at: at(15),
      active: false,
      summary: [{ area: 'agents', section: null, kind: 'removed', count: 1, titles: ['Fixture Desk'] }],
    },
    { seq: 1, label: 'cfg-1-fx7a8b9c', source: 'seed', rolled_back_from: null, note: null, created_by: null, created_at: at(1), active: false, summary: [] },
  ],
}
export const fxVersionsEmpty: VersionListResponse = { versions: [] }
export const fxVersionDiff: DiffResponse = {
  before: 'cfg-2-fx4d5e6f',
  after: 'cfg-3-fx1a2b3c',
  sections: [{ section: 'agents', diff: '' }],
  compared_with: 2,
  names: {
    agents: { fixture_desk: 'Fixture Receptionist', fixture_intake: 'Fixture Intake', fixture_old: 'Fixture Front Desk' },
    forms: { fixture_form: 'Fixture request' },
    departments: { intake: 'Fixture Intake' },
  },
  changes: [
    { area: 'answering', section: null, item: null, item_title: null, kind: 'changed', field: [], before: 'fixture_old', after: 'fixture_desk' },
    {
      area: 'knowledge',
      section: 'services',
      item: 'autism',
      item_title: 'Autism evaluation',
      kind: 'added',
      field: [],
      before: null,
      after: { key: 'autism', name: 'Autism evaluation', description: 'A full developmental evaluation for children, done over two visits.', wait_time: 'About 6 weeks' },
    },
    { area: 'knowledge', section: 'hours', item: null, item_title: null, kind: 'changed', field: ['weekly', 'sat'], before: null, after: ['09:00', '13:00'] },
    { area: 'departments', section: 'routing', item: 'intake', item_title: 'Fixture Intake', kind: 'changed', field: ['handled_by'], before: null, after: 'fixture_intake' },
    { area: 'departments', section: 'routing', item: 'intake', item_title: 'Fixture Intake', kind: 'changed', field: ['terms'], before: ['evaluation'], after: ['evaluation', 'autism'] },
    { area: 'forms', section: null, item: 'fixture_form', item_title: 'Fixture request', kind: 'added', field: ['fields', 'preferred_day'], before: null, after: { type: 'text', label: 'Preferred day', required: false } },
    { area: 'agents', section: null, item: 'fixture_desk', item_title: 'Fixture Receptionist', kind: 'changed', field: ['voice'], before: 'marin', after: 'cedar' },
    {
      area: 'agents',
      section: null,
      item: 'fixture_desk',
      item_title: 'Fixture Receptionist',
      kind: 'changed',
      field: ['persona'],
      before: 'The fictional receptionist.',
      after: 'The fictional receptionist used for screenshots, with a longer line that wraps on a phone and keeps going so it shows as two blocks.',
    },
  ],
}
export const fxVersionDiffEmpty: DiffResponse = { ...fxVersionDiff, changes: [] }

export const fxDetailGenericForm: CallDetail = {
  ...baseDetail,
  call: { ...baseDetail.call, agent_version: 'cfg-3-fx1a2b3c' },
  form: baseDetail.form
    ? {
        ...baseDetail.form,
        schema_version: 'fixture_form@cfg-3-fx1a2b3c',
        caller_relationship: null,
        insurance_carrier_verbatim: null,
        documents_held: null,
        fields: { preferred_day: 'tuesday', wants_brochure: true },
        definition: {
          name: 'fixture_form',
          title: 'Fixture request',
          fields: [
            { key: 'preferred_day', label: 'Preferred day', type: 'enum', required: true, values: ['monday', 'tuesday'], readback_label: 'your preferred day' },
            { key: 'wants_brochure', label: 'Brochure', type: 'bool', required: true, values: [], readback_label: 'whether you want a brochure' },
          ],
        },
      }
    : null,
}


/** Language list, lines and floors (fictional): English and Spanish have lines set by us. */
export const fxLanguageCatalog: LanguagesCatalog = {
  languages: [
    { code: 'en', name: 'English', native: 'English', dir: 'ltr' },
    { code: 'es', name: 'Spanish', native: 'Español', dir: 'ltr' },
    { code: 'ar', name: 'Arabic', native: 'العربية', dir: 'rtl' },
    { code: 'fr', name: 'French', native: 'Français', dir: 'ltr' },
  ],
  line_keys: [
    { key: 'after_hours_note', label: 'Closed now', help: 'Said when the clinic is closed.', group: 'speech', placeholders: ['{next_opening}'], builtin: false },
    { key: 'goodbye', label: 'Goodbye', help: 'Said at the end of every call.', group: 'speech', placeholders: [], builtin: true },
    { key: 'screen_title', label: 'Screen title', help: 'Shown at the top of the caller screen.', group: 'screen', placeholders: [], builtin: true },
    { key: 'crisis_screen', label: 'Crisis screen', help: 'Shown when a call stops for a crisis.', group: 'screen', placeholders: [], builtin: false },
  ],
  group_labels: { speech: 'What callers hear', screen: "What the caller's screen shows" },
  builtin_lines: {
    en: { goodbye: 'Thank you for calling. Goodbye.', screen_title: 'Fixture clinic line' },
    es: { goodbye: 'Gracias por llamar. Adiós.', screen_title: 'Línea de la clínica ficticia' },
  },
  crisis_floor: { en: ['fixture crisis'], es: ['crisis ficticia'] },
}

export const fxLanguages: SectionResponse = {
  name: 'languages',
  value: {
    default: 'en',
    items: {
      en: { enabled: true, lines: { after_hours_note: 'We are closed. We open {next_opening}.', crisis_screen: 'Call the fixture crisis number.' }, handoff: {}, crisis_phrases: [] },
      es: { enabled: true, lines: { after_hours_note: 'Estamos cerrados. Abrimos {next_opening}.' }, handoff: { fixture_desk: 'Le paso con el escritorio ficticio.' }, crisis_phrases: [] },
      ar: { enabled: false, lines: {}, handoff: {}, crisis_phrases: [] },
    },
  },
  draft_problems: [],
}

// --- Clinic sim (fictional practice clinic; every name is made up) -----------------------------
type ClinicSchemas = components['schemas']
const clinicId = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`

export const fxClinicInfo: ClinicSchemas['ClinicInfo'] = {
  name: 'Fixture Practice Clinic (fictional)',
  time_zone: 'America/New_York',
  slot_minutes: 30,
  opens: '09:00',
  closes: '17:00',
  weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
}

export const fxClinicDepartments: ClinicSchemas['ClinicDepartment'][] = [
  { id: 1, code: 'fixture_family', name: 'Family Medicine (fixture)' },
  { id: 2, code: 'fixture_skin', name: 'Dermatology (fixture)' },
]

export const fxClinicProviders: ClinicSchemas['ClinicProvider'][] = [
  { id: 11, department_id: 1, code: 'fx_okafor', display_name: 'Dr. Fixture Okafor' },
  { id: 12, department_id: 1, code: 'fx_lind', display_name: 'Dr. Fixture Lind' },
  { id: 21, department_id: 2, code: 'fx_moreau', display_name: 'Dr. Fixture Moreau' },
]

const clinicPatient = (n: number, first: string, last: string, dob: string): ClinicSchemas['ClinicPatient'] => ({
  id: clinicId(n),
  first_name: first,
  last_name: last,
  date_of_birth: dob,
  phone: `555-0${String(100 + n)}`,
  email: null,
  mrn: `FX-${String(n).padStart(5, '0')}`,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
})

export const fxClinicPatients: ClinicSchemas['ClinicPatientList'] = {
  items: [
    clinicPatient(1, 'Ana', 'Fixture', '1980-04-23'),
    clinicPatient(2, 'Ben', 'Example', '1975-11-02'),
    clinicPatient(3, 'Chloe', 'Sample', '1992-07-15'),
  ],
  total: 3,
}
export const fxClinicPatientsEmpty: ClinicSchemas['ClinicPatientList'] = { items: [], total: 0 }

const clinicAppt = (
  n: number,
  patient: number,
  department: number,
  provider: ClinicSchemas['ClinicProvider'],
  startsAt: string,
  status: 'booked' | 'cancelled' = 'booked',
): ClinicSchemas['ClinicAppointment'] => ({
  id: clinicId(100 + n),
  patient_id: clinicId(patient),
  department_id: department,
  provider_id: provider.id,
  provider_name: provider.display_name,
  starts_at: startsAt,
  ends_at: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString().replace('.000Z', 'Z'),
  visit_type: n % 2 ? 'new_patient' : 'follow_up',
  status,
  note: null,
  cancelled_at: status === 'cancelled' ? '2026-10-05T12:00:00Z' : null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
})

export const fxClinicAppointments: ClinicSchemas['ClinicAppointmentList'] = {
  items: [
    clinicAppt(1, 1, 1, fxClinicProviders[0], '2026-11-02T14:00:00Z'),
    clinicAppt(2, 2, 2, fxClinicProviders[2], '2026-11-03T15:30:00Z'),
    clinicAppt(3, 3, 1, fxClinicProviders[1], '2026-11-04T19:00:00Z', 'cancelled'),
  ],
  total: 3,
}

export const fxClinicSlots: ClinicSchemas['ClinicFreeSlot'][] = ['14:00', '14:30', '15:00', '16:30'].flatMap((t) =>
  fxClinicProviders
    .filter((p) => p.department_id === 1)
    .map((p) => ({
      provider_id: p.id,
      provider_name: p.display_name,
      starts_at: `2026-11-02T${t}:00Z`,
      ends_at: new Date(Date.parse(`2026-11-02T${t}:00Z`) + 30 * 60_000).toISOString().replace('.000Z', 'Z'),
    })),
)
