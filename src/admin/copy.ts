/** Every user-facing string in the staff admin area. Later steps append their page copy here. */
export const adminCopy = {
  navLabel: 'Staff pages',
  nav: {
    queue: 'Queue',
    followUp: 'Follow-up',
    calls: 'Calls',
    reports: 'Reports',
    exports: 'Exports',
    audit: 'Audit',
    account: 'Account',
  },
  pages: {
    queue: 'Review queue',
    'follow-up': 'Follow-up',
    calls: 'Calls',
    'call-detail': 'Call',
    reports: 'Reports',
    exports: 'Exports',
    audit: 'Audit log',
  },
  placeholderBody: 'This page is being built.',
  logout: 'Sign out',
  loggingOut: 'Signing out…',
  logoutError: 'Could not sign out. Try again.',
  authLoading: 'Checking your session',
  authError: 'Could not check your session.',
  retry: 'Retry',
  loadingArea: 'Loading staff area',
  forbidden: {
    title: "You don't have access to this page",
    body: 'Only admins can open it. Ask an admin if you need it.',
    link: 'Go to the queue',
  },
  login: {
    title: 'Staff sign-in',
    heading: 'Staff sign-in',
    email: 'Email',
    password: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    invalid: 'Email or password is incorrect.',
    tooMany: 'Too many attempts, try again shortly.',
    failed: 'Could not sign in. Check your connection and try again.',
  },
  account: {
    title: 'Account',
    heading: 'Your account',
    signedInAs: 'Signed in as',
    forced: 'Choose a new password to continue',
    current: 'Current password',
    next: 'New password',
    nextHint: 'At least 12 characters.',
    confirm: 'Confirm new password',
    submit: 'Change password',
    submitting: 'Changing…',
    currentRequired: 'Enter your current password.',
    tooShort: 'Use at least 12 characters.',
    mismatch: 'The passwords do not match.',
    wrongCurrent: 'Your current password is incorrect.',
    tooMany: 'Too many attempts, try again shortly.',
    failed: 'Could not change the password. Try again.',
    success: 'Password changed',
  },
  loading: 'Loading',
  openCall: 'Open call',
  none: 'None',
  dash: '—',
  apply: 'Apply',
  clear: 'Clear',
  any: 'Any',
  previous: 'Previous page',
  next: 'Next page',
  cols: {
    submitted: 'Submitted',
    afterHours: 'After hours',
    language: 'Language',
    category: 'Category',
    route: 'Route',
    flags: 'Open flags',
    call: 'Call',
    started: 'Started',
    ended: 'Ended',
    status: 'Status',
    outcome: 'Outcome',
    formStatus: 'Form status',
    tester: 'Tester',
    agentVersion: 'Agent version',
    reason: 'Reason',
    caller: 'Caller',
    action: 'Action',
    decided: 'Approved',
    relationship: 'Caller relationship',
    time: 'Time',
    actor: 'Actor',
    staffEmail: 'Staff email',
    target: 'Target',
    count: 'Count',
    period: 'Period start',
    turns: 'Turns',
    actions: 'Actions',
    p50: 'p50 (ms)',
    p90: 'p90 (ms)',
    kind: 'Kind',
    story: 'Story',
    mode: 'Mode',
    repeat: 'Repeat',
    passed: 'Result',
    stop: 'Stopped because',
    turnsBeforeRoute: 'Turns before routing',
    duration: 'Duration (s)',
    spend: 'Spend',
    findings: 'Findings (table · key · count)',
    file: 'File',
  },
  queue: {
    caption: 'Forms waiting for approval, after-hours first, then oldest first',
    empty: 'No forms waiting.',
    emptyBody: 'New ones appear after a caller confirms.',
    error: 'Could not load the queue.',
    refresh: 'Refresh',
    afterHours: 'After hours',
    stale: (time: string) => `Showing the queue from ${time} — couldn't refresh.`,
  },
  followUp: {
    caption: 'Calls waiting for a person, oldest first',
    empty: 'Nobody is waiting for a person.',
    error: 'Could not load the follow-up list.',
    acknowledge: 'Acknowledge',
    acknowledging: 'Acknowledging…',
    done: 'Marked as handled',
    conflict: 'Someone already handled this',
    failed: 'Could not mark it as handled. Try again.',
    form: 'Form',
  },
  calls: {
    caption: 'Calls, newest first',
    filters: 'Filter calls',
    dateFrom: 'From date',
    dateTo: 'To date',
    hasFlags: 'Open flags',
    onlyFlagged: 'Only with open flags',
    empty: 'No calls yet',
    emptyBody: 'Calls appear here once someone phones the line.',
    filteredEmpty: 'No calls match these filters',
    filteredEmptyBody: 'Change or clear the filters.',
    error: 'Could not load calls.',
    live: 'Live',
    ended: 'Ended',
  },
  reports: {
    form: 'Report period',
    period: 'Group by',
    day: 'Day',
    week: 'Week',
    unmet: 'Unmet demand',
    outcomes: 'Outcomes by category',
    routing: 'Routing mix',
    latency: 'Agent turn latency',
    delegation: 'Delegation time',
    total: (n: number) => `${n} ${n === 1 ? 'call' : 'calls'} in this period`,
    empty: 'Not enough calls in this period',
    emptyBody: 'Pick a wider period or another agent version.',
    error: 'Could not load reports.',
    gates: 'Release-gate and story-harness results',
    gatesEmpty: 'No gate results yet — they appear once the release-gate command publishes them',
    gatesCaption: 'Release gate and story harness runs, gate first, then harness, then live',
    kinds: { gate: 'Release gate', harness: 'Story harness', live: 'Live check' },
    passed: '✓ Passed',
    failed: '✗ Failed',
    unapproved: 'Unapproved content',
    unapprovedCaption: 'Placeholder content not yet approved by EPIC',
    unapprovedEmpty: 'All content is approved by EPIC',
  },
  exports: {
    caption: 'Approved forms not yet exported',
    run: 'Export',
    running: 'Exporting…',
    result: (n: number) => `Exported ${n} ${n === 1 ? 'form' : 'forms'}`,
    failed: 'Could not export. Try again.',
    empty: 'Nothing approved since the last export',
    error: 'Could not load forms ready to export.',
  },
  audit: {
    caption: 'Audit entries, newest first',
    filter: 'Action',
    all: 'All actions',
    empty: 'No audit entries yet',
    filteredEmpty: 'No entries for this action',
    error: 'Could not load the audit log.',
  },
  detail: {
    summary: 'Summary',
    notFound: "This call doesn't exist",
    backToCalls: 'Back to calls',
    error: 'Could not load this call.',
    failed: 'Could not save. Try again.',
    conflict: 'Someone else changed this form — showing the latest',
    live: 'In progress — read-only',
    inProgress: 'In progress',
    jump: 'Jump to transcript',
    statedName: 'Stated name',
    statedReason: 'Stated reason',
    recording: 'Recording',
    audioLabel: 'Call recording',
    recordingUnavailable: (reason: string) => `Recording unavailable — ${reason}`,
    noReason: 'no audio was saved',
    liveReason: 'the call is still in progress',
    transcript: 'Transcript',
    sessions: 'Sessions',
    session: (seq: number) => `Session ${seq}`,
    voice: 'voice',
    endReason: 'ended by',
    noSessions: 'No sessions recorded.',
    timeline: 'Timeline',
    emptyTimeline: 'Nothing was said on this call.',
    caller: 'Caller',
    agent: 'Agent',
    action: 'Action',
    flag: 'Flag',
    field: 'field',
    latency: (ms: number) => `latency ${ms} ms`,
    delegation: (ms: number) => `delegation ${ms} ms`,
    acknowledge: 'Acknowledge',
    acknowledging: 'Acknowledging…',
    acknowledgeFlag: (kind: string) => `Acknowledge ${kind} flag`,
    flagAcked: 'Flag acknowledged',
    form: 'Form',
    noForm: (outcome: string) => `No form — this call ended as ${outcome}`,
    noFormYet: 'No form — this call has no outcome yet',
    afterHoursQueued: 'Queued after hours',
    submitted: 'Submitted',
    decided: 'Decided',
    exported: 'Exported',
    rejectReasonShown: 'Reject reason',
    fieldLabels: {
      caller_relationship: 'Caller relationship',
      insurance_carrier_verbatim: 'Insurance carrier',
      callback_number: 'Callback number',
      callback_consent: 'Callback consent',
      documents_held: 'Documents held',
    } as Record<string, string>,
    listHint: 'Separate items with commas.',
    save: 'Save',
    saveField: (field: string) => `Save ${field}`,
    saved: (field: string) => `Saved ${field}`,
    approve: 'Approve',
    approving: 'Approving…',
    approved: 'Form approved',
    approveHint: 'Acknowledge the flags first',
    reject: 'Reject',
    rejectReason: 'Reason for rejecting',
    reasonRequired: 'Enter a reason for rejecting.',
    reasonTooLong: 'Use 500 characters or fewer.',
    confirmReject: 'Confirm reject',
    rejecting: 'Rejecting…',
    rejected: 'Form rejected',
    cancel: 'Cancel',
    history: 'Field history',
    historyEmpty: 'No changes yet.',
  },
} as const

export type AdminPageKey = keyof typeof adminCopy.pages

type Tone = 'ok' | 'error' | 'warning'

/** "human_needed" → "Human needed"; null → dash. */
export function label(value: string | null | undefined): string {
  if (!value) return adminCopy.dash
  const text = value.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function orDash(value: string | null | undefined): string {
  return value ? value : adminCopy.dash
}

/** Local date and time for a server timestamp. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return adminCopy.dash
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Local HH:MM for an epoch-ms value. */
export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** YYYY-MM-DD in local time. */
export function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function outcomeTone(outcome: string | null | undefined): Tone {
  if (outcome === 'crisis' || outcome === 'error') return 'error'
  if (outcome === 'routed' || outcome === 'referred' || outcome === 'clinic_form') return 'ok'
  return 'warning'
}

export function formStatusTone(status: string | null | undefined): Tone {
  if (status === 'rejected') return 'error'
  if (status === 'incomplete' || status === 'flagged') return 'warning'
  return 'ok'
}

/** Local time of day with seconds, for timeline entries. */
export function formatTimeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function yesNo(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return adminCopy.dash
  return value ? 'Yes' : 'No'
}
