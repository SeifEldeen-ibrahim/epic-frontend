import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { AdminApiError, handle } from './admin'
import { api } from './client'
import type { components } from './schema'

type S = components['schemas']
export type ConfigState = S['ConfigStateResponse']
export type Problem = S['ProblemItem']
export type Catalog = S['CatalogResponse']
export type AgentSummary = S['AgentSummary']
export type FormSummary = S['FormSummary']
export type SectionResponse = S['SectionResponse']
export type SectionSave = S['SectionSaveResponse']
export type Compiled = S['CompiledResponse']
export type PublishResponse = S['PublishResponse']
export type VersionItem = S['VersionItem']
export type VersionDetail = S['VersionDetail']
export type DiffResponse = S['DiffResponse']
export type ChangeItem = S['ChangeItem']
export type ChangeNames = S['ChangeNames']
export type ChangeSummaryItem = S['ChangeSummaryItem']
export type LanguagesCatalog = S['LanguagesCatalogResponse']
/** Code-owned floors; `crisis` maps a language code to its locked crisis phrases. */
export type CatalogFloor = Catalog['floor']

/** Knowledge sections the editor knows (the API refuses any other). */
export const KNOWLEDGE_SECTIONS = [
  'routing',
  'services',
  'referrals',
  'hours',
  'wording',
  'crisis',
  'never_spoken',
  'clinic',
] as const
export type KnowledgeSection = (typeof KNOWLEDGE_SECTIONS)[number]

/** A config request refused with the bundle's problems (422 invalid / 409 draft invalid). */
export class ConfigProblemsError extends AdminApiError {
  readonly problems: Problem[]
  constructor(status: number, problems: Problem[]) {
    super(status, 'invalid')
    this.name = 'ConfigProblemsError'
    this.problems = problems
  }
}

interface ApiResult<T> {
  data?: T
  error?: unknown
  response: { status: number }
}

function problemsOf(error: unknown): Problem[] | null {
  if (!error || typeof error !== 'object' || !('detail' in error)) return null
  const d = (error as { detail: unknown }).detail
  if (d && typeof d === 'object' && 'problems' in d && Array.isArray((d as { problems: unknown }).problems)) {
    return (d as { problems: Problem[] }).problems
  }
  return null
}

/** `handle` plus the problem list of a 422/409 config refusal. */
function unwrap<T>(qc: QueryClient, result: ApiResult<T>): T {
  const problems = problemsOf(result.error)
  if (problems) throw new ConfigProblemsError(result.response.status, problems)
  return handle(qc, result)
}

export const configKeys = {
  all: ['admin', 'config'] as const,
  state: () => ['admin', 'config', 'state'] as const,
  catalog: () => ['admin', 'config', 'catalog'] as const,
  knowledge: (section: string) => ['admin', 'config', 'knowledge', section] as const,
  agents: () => ['admin', 'config', 'agents'] as const,
  agent: (name: string) => ['admin', 'config', 'agent', name] as const,
  compiled: (name: string) => ['admin', 'config', 'compiled', name] as const,
  forms: () => ['admin', 'config', 'forms'] as const,
  form: (name: string) => ['admin', 'config', 'form', name] as const,
  versions: () => ['admin', 'config', 'versions'] as const,
  version: (seq: number) => ['admin', 'config', 'version', seq] as const,
  versionDiff: (seq: number) => ['admin', 'config', 'version-diff', seq] as const,
  draftDiff: () => ['admin', 'config', 'draft-diff'] as const,
  languageCatalog: () => ['admin', 'config', 'language-catalog'] as const,
  languages: () => ['admin', 'config', 'languages'] as const,
}

export function useConfigState() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: configKeys.state(),
    queryFn: async () => unwrap(qc, await api.GET('/api/admin/config')),
  })
}

export function useCatalog() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: configKeys.catalog(),
    queryFn: async () => unwrap(qc, await api.GET('/api/admin/config/catalog')),
    staleTime: Infinity,
  })
}

export function useKnowledgeSection(section: KnowledgeSection) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: configKeys.knowledge(section),
    queryFn: async () =>
      unwrap(qc, await api.GET('/api/admin/config/draft/knowledge/{section}', { params: { path: { section } } })),
  })
}

export function useAgents() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: configKeys.agents(),
    queryFn: async () => unwrap(qc, await api.GET('/api/admin/config/draft/agents')),
  })
}

export function useAgent(name: string) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: configKeys.agent(name),
    queryFn: async () =>
      unwrap(qc, await api.GET('/api/admin/config/draft/agents/{name}', { params: { path: { name } } })),
    enabled: name !== '',
    retry: false,
  })
}

export function useCompiled(name: string, enabled: boolean) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: configKeys.compiled(name),
    queryFn: async () =>
      unwrap(qc, await api.GET('/api/admin/config/draft/agents/{name}/compiled', { params: { path: { name } } })),
    enabled: enabled && name !== '',
    retry: false,
  })
}

export function useForms() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: configKeys.forms(),
    queryFn: async () => unwrap(qc, await api.GET('/api/admin/config/draft/forms')),
  })
}

export function useForm(name: string) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: configKeys.form(name),
    queryFn: async () =>
      unwrap(qc, await api.GET('/api/admin/config/draft/forms/{name}', { params: { path: { name } } })),
    enabled: name !== '',
    retry: false,
  })
}

export function useVersions() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: configKeys.versions(),
    queryFn: async () => unwrap(qc, await api.GET('/api/admin/config/versions')),
  })
}

export function useVersionDiff(seq: number) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: configKeys.versionDiff(seq),
    queryFn: async () =>
      unwrap(qc, await api.GET('/api/admin/config/versions/{seq}/diff', { params: { path: { seq } } })),
    enabled: Number.isInteger(seq) && seq > 0,
    retry: false,
  })
}

export function useDraftDiff(enabled: boolean) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: configKeys.draftDiff(),
    queryFn: async () => unwrap(qc, await api.GET('/api/admin/config/draft/diff')),
    enabled,
  })
}

/** The language list, line keys, built-in en/es lines and crisis floors (code-owned, never changes at runtime). */
export function useLanguageCatalog() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: configKeys.languageCatalog(),
    queryFn: async () => unwrap(qc, await api.GET('/api/admin/config/languages/catalog')),
    staleTime: Infinity,
  })
}

/** The draft `languages` section. */
export function useLanguages() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: configKeys.languages(),
    queryFn: async () => unwrap(qc, await api.GET('/api/admin/config/draft/languages')),
  })
}

/** After any draft write: the state (problems, changed sections) and draft lists refetch. */
function draftChanged(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: configKeys.state() })
  void qc.invalidateQueries({ queryKey: configKeys.agents() })
  void qc.invalidateQueries({ queryKey: configKeys.forms() })
  void qc.invalidateQueries({ queryKey: configKeys.draftDiff() })
  void qc.invalidateQueries({ queryKey: ['admin', 'config', 'compiled'] })
  void qc.invalidateQueries({ queryKey: ['admin', 'config', 'home'] })
}

export function useSaveKnowledge(section: KnowledgeSection) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (value: unknown) =>
      unwrap(
        qc,
        await api.PUT('/api/admin/config/draft/knowledge/{section}', {
          params: { path: { section } },
          body: { value },
        }),
      ),
    onSuccess: (saved) => {
      qc.setQueryData<SectionResponse>(configKeys.knowledge(section), {
        name: saved.name,
        value: saved.value,
        draft_problems: saved.draft_problems,
      })
      draftChanged(qc)
    },
  })
}

export function useSaveAgent(name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (value: unknown) =>
      unwrap(qc, await api.PUT('/api/admin/config/draft/agents/{name}', { params: { path: { name } }, body: { value } })),
    onSuccess: (saved) => {
      qc.setQueryData<SectionResponse>(configKeys.agent(name), {
        name: saved.name,
        value: saved.value,
        draft_problems: saved.draft_problems,
      })
      draftChanged(qc)
    },
  })
}

export function useSaveForm(name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (value: unknown) =>
      unwrap(qc, await api.PUT('/api/admin/config/draft/forms/{name}', { params: { path: { name } }, body: { value } })),
    onSuccess: (saved) => {
      qc.setQueryData<SectionResponse>(configKeys.form(name), {
        name: saved.name,
        value: saved.value,
        draft_problems: saved.draft_problems,
      })
      draftChanged(qc)
    },
  })
}

/** Saves the whole draft `languages` section; a 422 throws `ConfigProblemsError` (paths like `ar.lines.<key>`). */
export function useSaveLanguages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (value: unknown) =>
      unwrap(qc, await api.PUT('/api/admin/config/draft/languages', { body: { value } })),
    onSuccess: (saved) => {
      qc.setQueryData<SectionResponse>(configKeys.languages(), {
        name: saved.name,
        value: saved.value,
        draft_problems: saved.draft_problems,
      })
      draftChanged(qc)
    },
  })
}

export function useSaveEntryAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string | null) =>
      unwrap(qc, await api.PUT('/api/admin/config/draft/entry-agent', { body: { value: name } })),
    onSuccess: () => draftChanged(qc),
  })
}

/** Every config query refetches (a publish/rollback/discard changes the whole draft). */
function everythingChanged(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: configKeys.all })
}

export function useDiscardDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => unwrap(qc, await api.POST('/api/admin/config/draft/discard', { body: {} })),
    onSuccess: () => everythingChanged(qc),
  })
}

export function useLoadDefaults() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => unwrap(qc, await api.POST('/api/admin/config/draft/load-defaults', { body: {} })),
    onSuccess: () => everythingChanged(qc),
  })
}

export function usePublish() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { based_on_seq: number; note?: string | null }) =>
      unwrap(qc, await api.POST('/api/admin/config/publish', { body })),
    onSuccess: () => everythingChanged(qc),
  })
}

export function useRollback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ seq, note }: { seq: number; note?: string | null }) =>
      unwrap(qc, await api.POST('/api/admin/config/versions/{seq}/rollback', { params: { path: { seq } }, body: { note } })),
    onSuccess: () => everythingChanged(qc),
  })
}

/** Problems that belong to one document (and optionally a path prefix). */
export function problemsFor(problems: readonly Problem[] | undefined, document: string): Problem[] {
  return (problems ?? []).filter((p) => p.document === document || p.document.startsWith(`${document}.`))
}

export function isStale(error: unknown): boolean {
  return error instanceof AdminApiError && error.status === 409 && error.detail === 'stale_draft'
}
