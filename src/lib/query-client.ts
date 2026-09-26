import { QueryClient } from '@tanstack/react-query'

/**
 * The single React Query client, shared between `App.tsx`'s provider and the
 * non-React offline-queue code (the drain) that needs to write server
 * responses into the same cache the screens read from.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
})
