import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

/**
 * Lists here are single-page reads (`pageSize=100`, see
 * `CHECKLISTS_LIST_PARAMS` / `APPLICATIONS_LIST_PARAMS`) — there are no extra
 * pages to append, so hitting the bottom of a list means "I want this fresh"
 * rather than "give me more". This turns `onEndReached` into an invalidate of
 * the list queries backing the screen.
 *
 * `onEndReached` fires again on every small scroll once you're near the end,
 * so the cooldown is what keeps one flick from firing a burst of requests.
 */
const COOLDOWN_MS = 5_000

export function useRefreshOnEndReached(queryKeys: readonly (readonly unknown[])[]) {
  const queryClient = useQueryClient()
  // Callers build these keys inline, so the array is a new value every render —
  // a ref keeps the returned handler stable without a dependency on its identity.
  const keysRef = useRef(queryKeys)
  keysRef.current = queryKeys
  const lastRunAtRef = useRef(0)

  return useCallback(() => {
    const now = Date.now()
    if (now - lastRunAtRef.current < COOLDOWN_MS) return
    lastRunAtRef.current = now
    for (const queryKey of keysRef.current) {
      void queryClient.invalidateQueries({ queryKey: queryKey as unknown[] })
    }
  }, [queryClient])
}
