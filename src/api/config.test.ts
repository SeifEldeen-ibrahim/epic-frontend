import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { api } from './client'
import {
  ConfigProblemsError,
  configKeys,
  isStale,
  problemsFor,
  useLanguageCatalog,
  useLanguages,
  usePublish,
  useSaveAgent,
  useSaveLanguages,
} from './config'
import { createQueryClient } from './queryClient'

vi.mock('./client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() } }))

const POST = vi.mocked(api.POST) as unknown as Mock
const PUT = vi.mocked(api.PUT) as unknown as Mock

function reply(status: number, body: object) {
  const ok = status < 400
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status } }
}

function setup() {
  const qc = createQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children)
  return { qc, wrapper }
}

beforeEach(() => {
  POST.mockReset()
  PUT.mockReset()
})

describe('T-FE: config hooks', () => {
  it('a publish refused with problems throws them; a stale draft is recognised', async () => {
    const { wrapper } = setup()
    const problems = [{ document: 'agents.x', path: 'voice', message: 'unknown voice' }]
    POST.mockResolvedValueOnce(reply(422, { detail: { code: 'invalid', problems } }))
    const { result } = renderHook(() => usePublish(), { wrapper })
    await expect(result.current.mutateAsync({ based_on_seq: 1 })).rejects.toBeInstanceOf(ConfigProblemsError)
    POST.mockResolvedValueOnce(reply(409, { detail: 'stale_draft' }))
    const err = await result.current.mutateAsync({ based_on_seq: 1 }).catch((e: unknown) => e)
    expect(isStale(err)).toBe(true)
  })

  it('a saved agent is written into the cache and the state is refreshed', async () => {
    const { qc, wrapper } = setup()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    PUT.mockResolvedValueOnce(reply(200, { name: 'agents.desk', value: { name: 'desk' }, draft_problems: [] }))
    const { result } = renderHook(() => useSaveAgent('desk'), { wrapper })
    await result.current.mutateAsync({ name: 'desk' })
    await waitFor(() => expect(qc.getQueryData(configKeys.agent('desk'))).toEqual({ name: 'agents.desk', value: { name: 'desk' }, draft_problems: [] }))
    expect(spy).toHaveBeenCalledWith({ queryKey: configKeys.state() })
  })

  it('problemsFor keeps one document', () => {
    const list = [
      { document: 'agents.a', path: 'x', message: 'm' },
      { document: 'agents.ab', path: 'x', message: 'm' },
    ]
    expect(problemsFor(list, 'agents.a')).toEqual([list[0]])
  })
})

describe('T-HOOKS: language hooks', () => {
  const GET = vi.mocked(api.GET) as unknown as Mock

  it('the language hooks fetch, save and invalidate the draft and diff keys', async () => {
    GET.mockReset()
    const { qc, wrapper } = setup()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const catalog = { languages: [{ code: 'ar', name: 'Arabic', native: 'العربية', dir: 'rtl' }], line_keys: [], group_labels: {}, builtin_lines: {}, crisis_floor: {} }
    const section = { name: 'languages', value: { default: 'en' }, draft_problems: [] }
    GET.mockImplementation(async (path: string) =>
      reply(200, path === '/api/admin/config/languages/catalog' ? catalog : section),
    )
    const cat = renderHook(() => useLanguageCatalog(), { wrapper })
    const langs = renderHook(() => useLanguages(), { wrapper })
    await waitFor(() => expect(cat.result.current.data).toEqual(catalog))
    await waitFor(() => expect(langs.result.current.data).toEqual(section))
    expect(GET).toHaveBeenCalledWith('/api/admin/config/draft/languages')

    const saved = { name: 'languages', value: { default: 'en', enabled: ['en', 'ar'] }, draft_problems: [] }
    PUT.mockResolvedValueOnce(reply(200, saved))
    const save = renderHook(() => useSaveLanguages(), { wrapper })
    await save.result.current.mutateAsync(saved.value)
    expect(PUT).toHaveBeenCalledWith('/api/admin/config/draft/languages', { body: { value: saved.value } })
    await waitFor(() => expect(qc.getQueryData(configKeys.languages())).toEqual(saved))
    expect(spy).toHaveBeenCalledWith({ queryKey: configKeys.state() })
    expect(spy).toHaveBeenCalledWith({ queryKey: configKeys.draftDiff() })
  })

  it('a refused language save throws its problems', async () => {
    const { wrapper } = setup()
    const problems = [{ document: 'languages', path: 'ar.lines.after_hours_note', message: 'Arabic: missing' }]
    PUT.mockResolvedValueOnce(reply(422, { detail: { code: 'invalid', problems } }))
    const save = renderHook(() => useSaveLanguages(), { wrapper })
    const err = await save.result.current.mutateAsync({}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConfigProblemsError)
    expect((err as ConfigProblemsError).problems).toEqual(problems)
  })
})
