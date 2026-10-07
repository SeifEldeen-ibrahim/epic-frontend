// FIXTURE-ONLY-7f3a — dev-only admin screenshot fixtures (loaded only when import.meta.env.DEV).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Middleware } from 'openapi-fetch'
import { useEffect, useLayoutEffect, useState } from 'react'
import { Link, Route, Routes, UNSAFE_RouteContext, useParams } from 'react-router'
import { adminKeys } from '../../api/admin'
import type { StaffMe } from '../../api/auth'
import { api } from '../../api/client'
import { AdminRoutes } from '../AdminRoutes'
import {
  FIXTURE_MARKER,
  FX_CALL_ID,
  fxAdmin,
  fxAudit,
  fxCalls,
  fxCallsEmpty,
  fxDetail,
  fxExports,
  fxFollowUp,
  fxMustChange,
  fxQueue,
  fxReports,
  fxReportsEmpty,
  fxReviewer,
  fxVoiceMode,
  fxAgentDesk,
  fxAgents,
  fxAgentSwitchboard,
  fxCatalog,
  fxCompiled,
  fxConfigBanners,
  fxConfigProblems,
  fxConfigReviewer,
  fxConfigState,
  fxDetailGenericForm,
  fxForm,
  fxForms,
  fxFormsEmpty,
  fxRouting,
  fxVersionDiff,
  fxVersions,
} from './data'

type Reply = (n: number) => Response | Promise<Response>
type After = (qc: QueryClient) => () => void
interface ViewSpec {
  path: string
  me: StaffMe | null
  replies: Record<string, Reply>
  after?: After
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const ok =
  (body: unknown): Reply =>
  () =>
    json(200, body)
const fail =
  (status: number, detail: string): Reply =>
  () =>
    json(status, { detail })
const hang: Reply = () => new Promise<Response>(() => undefined)

/** Polls until each DOM step reports done (for views that need a user action, e.g. a submit). */
function drive(...steps: (() => boolean)[]): () => void {
  let i = 0
  const t = window.setInterval(() => {
    if (i >= steps.length) window.clearInterval(t)
    else if (steps[i]()) i += 1
  }, 100)
  return () => window.clearInterval(t)
}

function fill(testId: string, value: string): boolean {
  const el = document.querySelector(`[data-testid=${testId}]`)
  const input = el instanceof HTMLInputElement ? el : el?.querySelector('input')
  if (!input) return false
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return true
}

function click(testId: string): boolean {
  const el = document.querySelector(`[data-testid=${testId}]`)
  if (!(el instanceof HTMLButtonElement) || el.disabled) return false
  el.click()
  return true
}

const PAGES: Record<string, [string, unknown]> = {
  queue: ['GET /api/admin/queue', fxQueue],
  'follow-up': ['GET /api/admin/follow-up', fxFollowUp],
  calls: ['GET /api/admin/calls', fxCalls],
  reports: ['GET /api/admin/reports', fxReports],
  exports: ['GET /api/admin/exports', fxExports],
  audit: ['GET /api/admin/audit', fxAudit],
  settings: ['GET /api/admin/settings/voice-mode', fxVoiceMode],
}

const DETAIL = `/admin/calls/${FX_CALL_ID}`
const DETAIL_GET = 'GET /api/admin/calls/{call_id}'

const VIEWS: Record<string, ViewSpec> = {}
for (const [page, [key, body]] of Object.entries(PAGES)) {
  VIEWS[`${page}-populated`] = { path: `/admin/${page}`, me: fxAdmin, replies: { [key]: ok(body) } }
  VIEWS[`${page}-loading`] = { path: `/admin/${page}`, me: fxAdmin, replies: { [key]: hang } }
  VIEWS[`${page}-error`] = { path: `/admin/${page}`, me: fxAdmin, replies: { [key]: fail(500, 'fixture error') } }
}
Object.assign(VIEWS, {
  'reports-empty': { path: '/admin/reports', me: fxAdmin, replies: { 'GET /api/admin/reports': ok(fxReportsEmpty) } },
  'calls-filtered-empty': {
    path: '/admin/calls?outcome=crisis',
    me: fxAdmin,
    replies: { 'GET /api/admin/calls': ok(fxCallsEmpty) },
  },
  'queue-stale': {
    path: '/admin/queue',
    me: fxAdmin,
    replies: { 'GET /api/admin/queue': (n) => (n === 1 ? json(200, fxQueue) : json(500, { detail: 'fixture error' })) },
    after: (qc) => {
      let done = false
      return qc.getQueryCache().subscribe(({ query }) => {
        if (done || query.queryKey[1] !== 'queue' || query.state.status !== 'success') return
        done = true
        void qc.refetchQueries({ queryKey: adminKeys.queue() })
      })
    },
  },
  forbidden: { path: '/admin/exports', me: fxReviewer, replies: { 'GET /api/admin/exports': ok(fxExports) } },
  'login-error': {
    path: '/admin/login',
    me: null,
    replies: { 'POST /api/admin/auth/login': fail(401, 'invalid_credentials') },
    after: () =>
      drive(
        () => fill('login-email', 'fixture@example.test') && fill('login-password', 'fixture-password'),
        () => click('login-submit'),
      ),
  },
  'account-forced': { path: '/admin/account', me: fxMustChange, replies: {} },
  'detail-form': { path: DETAIL, me: fxAdmin, replies: { [DETAIL_GET]: ok(fxDetail.form) } },
  'detail-flags-open': { path: DETAIL, me: fxAdmin, replies: { [DETAIL_GET]: ok(fxDetail.flagsOpen) } },
  'detail-no-form': { path: DETAIL, me: fxAdmin, replies: { [DETAIL_GET]: ok(fxDetail.noForm) } },
  'detail-live': { path: DETAIL, me: fxAdmin, replies: { [DETAIL_GET]: ok(fxDetail.live) } },
  'detail-recording-unavailable': {
    path: DETAIL,
    me: fxAdmin,
    replies: { [DETAIL_GET]: ok(fxDetail.recordingUnavailable) },
  },
  'detail-realtime': { path: DETAIL, me: fxAdmin, replies: { [DETAIL_GET]: ok(fxDetail.realtime) } },
  'settings-default': {
    path: '/admin/settings',
    me: fxAdmin,
    replies: { 'GET /api/admin/settings/voice-mode': ok({ mode: 'gpt-live', stored: false, updated_at: null }) },
  },
  'settings-save-error': {
    path: '/admin/settings',
    me: fxAdmin,
    replies: {
      'GET /api/admin/settings/voice-mode': ok(fxVoiceMode),
      'POST /api/admin/settings/voice-mode': fail(503, 'unavailable'),
    },
    after: () =>
      drive(
        () => {
          const input = document.querySelector('[data-testid=settings-mode-realtime] input')
          if (!(input instanceof HTMLInputElement)) return false
          input.click()
          return true
        },
        () => click('settings-save'),
      ),
  },
  'settings-forbidden': {
    path: '/admin/settings',
    me: fxReviewer,
    replies: { 'GET /api/admin/settings/voice-mode': ok(fxVoiceMode) },
  },
  'detail-loading': { path: DETAIL, me: fxAdmin, replies: { [DETAIL_GET]: hang } },
  'detail-not-found': { path: DETAIL, me: fxAdmin, replies: { [DETAIL_GET]: fail(404, 'not_found') } },
  'detail-conflict': {
    path: DETAIL,
    me: fxAdmin,
    replies: {
      [DETAIL_GET]: ok(fxDetail.form),
      'POST /api/admin/calls/{call_id}/form/approve': fail(409, 'fixture conflict'),
    },
    after: () => drive(() => click('form-approve')),
  },
} satisfies Record<string, ViewSpec>)

// --- admin-knowledge views -------------------------------------------------------------------
const CFG = (state: unknown = fxConfigState): Record<string, Reply> => ({
  'GET /api/admin/config': ok(state),
  'GET /api/admin/config/catalog': ok(fxCatalog),
  'GET /api/admin/config/draft/knowledge/{section}': ok(fxRouting),
  'GET /api/admin/config/draft/agents': ok(fxAgents),
  'GET /api/admin/config/draft/forms': ok(fxForms),
  'GET /api/admin/config/draft/diff': ok(fxVersionDiff),
})
Object.assign(VIEWS, {
  knowledge: { path: '/admin/knowledge', me: fxAdmin, replies: CFG() },
  'knowledge-errors': { path: '/admin/knowledge', me: fxAdmin, replies: CFG(fxConfigProblems) },
  'knowledge-banners': { path: '/admin/knowledge', me: fxAdmin, replies: CFG(fxConfigBanners) },
  'knowledge-reviewer': { path: '/admin/knowledge', me: fxReviewer, replies: CFG(fxConfigReviewer) },
  'knowledge-edit-dialog': {
    path: '/admin/knowledge',
    me: fxAdmin,
    replies: CFG(),
    after: () => drive(() => click('routing-edit-fixture_dept')),
  },
  agents: { path: '/admin/agents', me: fxAdmin, replies: CFG() },
  'agent-new': { path: '/admin/agents/new', me: fxAdmin, replies: CFG() },
  'agent-editor': {
    path: '/admin/agents/fixture_desk',
    me: fxAdmin,
    replies: {
      ...CFG(),
      'GET /api/admin/config/draft/agents/{name}': ok(fxAgentDesk),
      'GET /api/admin/config/draft/agents/{name}/compiled': ok(fxCompiled),
    },
  },
  'agent-editor-switchboard': {
    path: '/admin/agents/switchboard',
    me: fxAdmin,
    replies: { ...CFG(), 'GET /api/admin/config/draft/agents/{name}': ok(fxAgentSwitchboard) },
  },
  'agent-reviewer': {
    path: '/admin/agents/fixture_desk',
    me: fxReviewer,
    replies: { ...CFG(fxConfigReviewer), 'GET /api/admin/config/draft/agents/{name}': ok(fxAgentDesk) },
  },
  forms: { path: '/admin/forms', me: fxAdmin, replies: CFG() },
  'forms-empty': { path: '/admin/forms', me: fxAdmin, replies: { ...CFG(), 'GET /api/admin/config/draft/forms': ok(fxFormsEmpty) } },
  'form-builder': {
    path: '/admin/forms/fixture_form',
    me: fxAdmin,
    replies: { ...CFG(), 'GET /api/admin/config/draft/forms/{name}': ok(fxForm) },
  },
  'publish-confirm': {
    path: '/admin/knowledge',
    me: fxAdmin,
    replies: CFG(),
    after: () => drive(() => click('config-publish')),
  },
  'publish-errors': {
    path: '/admin/knowledge',
    me: fxAdmin,
    replies: {
      ...CFG(),
      'POST /api/admin/config/publish': () =>
        json(422, { detail: { code: 'invalid', problems: fxConfigProblems.draft_problems } }),
    },
    after: () => drive(() => click('config-publish'), () => click('config-confirm-confirm')),
  },
  'stale-409': {
    path: '/admin/knowledge',
    me: fxAdmin,
    replies: { ...CFG(), 'POST /api/admin/config/publish': fail(409, 'stale_draft') },
    after: () => drive(() => click('config-publish'), () => click('config-confirm-confirm')),
  },
  versions: { path: '/admin/versions', me: fxAdmin, replies: { ...CFG(), 'GET /api/admin/config/versions': ok(fxVersions) } },
  'version-diff': {
    path: '/admin/versions/2',
    me: fxAdmin,
    replies: { ...CFG(), 'GET /api/admin/config/versions/{seq}/diff': ok(fxVersionDiff) },
  },
  'queue-generic-form': { path: DETAIL, me: fxAdmin, replies: { [DETAIL_GET]: ok(fxDetailGenericForm) } },
} satisfies Record<string, ViewSpec>)

/** Clears the parent route match so the nested routes match `/admin/...` from the root. */
const ROOT_ROUTE = { outlet: null, matches: [], isDataRoute: false }

function FixtureView({ spec }: { spec: ViewSpec }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  )

  // Layout effect: installed before the pages' queries subscribe (passive effects) and fetch.
  useLayoutEffect(() => {
    const counts = new Map<string, number>()
    const mw: Middleware = {
      onRequest({ request, schemaPath }) {
        const key = `${request.method} ${schemaPath}`
        const n = (counts.get(key) ?? 0) + 1
        counts.set(key, n)
        if (key === 'GET /api/admin/auth/me') return spec.me ? json(200, spec.me) : json(401, { detail: 'not_signed_in' })
        const reply = spec.replies[key]
        return reply ? reply(n) : json(404, { detail: 'no fixture' })
      },
    }
    api.use(mw)
    return () => api.eject(mw)
  }, [spec])

  useEffect(() => spec.after?.(qc), [spec, qc])

  return (
    <QueryClientProvider client={qc}>
      <div data-fixture={FIXTURE_MARKER}>
        <UNSAFE_RouteContext.Provider value={ROOT_ROUTE}>
          <Routes location={spec.path}>
            <Route path="/admin/*" element={<AdminRoutes />} />
          </Routes>
        </UNSAFE_RouteContext.Provider>
      </div>
    </QueryClientProvider>
  )
}

/** Dev-only `/admin/fixtures/:view`: the real admin pages over static, fictional API replies. */
export function AdminFixtures() {
  const { view = '' } = useParams()
  const spec = Object.hasOwn(VIEWS, view) ? VIEWS[view] : undefined
  if (spec) return <FixtureView key={view} spec={spec} />
  return (
    <main className="admin-page" data-testid="fixtures-index" data-fixture={FIXTURE_MARKER}>
      <h1>Admin fixtures (fictional data)</h1>
      <ul>
        {Object.keys(VIEWS).map((v) => (
          <li key={v}>
            <Link className="ui-link" to={`/admin/fixtures/${v}`}>
              {v}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
