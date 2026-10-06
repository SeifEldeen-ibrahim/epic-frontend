import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { components } from './schema'

export type HealthResponse = components['schemas']['HealthResponse']

export const healthQueryKey = ['health'] as const

/**
 * Fetches /api/health. The backend answers 200 when healthy and 503 with the
 * same HealthResponse body when degraded; both are returned as data. Any other
 * status or a network failure is thrown as an Error.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  const { data, error, response } = await api.GET('/api/health')
  if (data) return data
  if (response.status === 503 && error && typeof error === 'object' && 'status' in error) {
    return error as HealthResponse
  }
  throw new Error(`Health check failed: HTTP ${response.status}`)
}

export function useHealth() {
  return useQuery({
    queryKey: healthQueryKey,
    queryFn: fetchHealth,
    retry: false,
    staleTime: 10_000,
  })
}
