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
    { file: 'content/after_hours.es.md', status: 'awaiting_epic_review' },
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
