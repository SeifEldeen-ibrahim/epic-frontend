import { QueryClient } from '@tanstack/react-query'

/** Creates a fresh QueryClient (one per app root / per test). */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  })
}
