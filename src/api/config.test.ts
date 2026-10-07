import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { api } from './client'
import { ConfigProblemsError, configKeys, isStale, problemsFor, usePublish, useSaveAgent } from './config'
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
