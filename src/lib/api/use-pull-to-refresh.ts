import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

/**
 * Pull-to-refresh for any screen: refetches every query currently mounted
 * (`type: 'active'`), so a screen doesn't have to know which keys back it.
 * Inactive cached queries are only marked stale and refetch when next used.
 *
 * `refreshing` follows the pull gesture, not background refetches — a
 * spinner that pops up on its own every focus/reconnect would be noise.
 */
export function usePullToRefresh() {
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await queryClient.invalidateQueries({ refetchType: 'active' })
    } finally {
      setRefreshing(false)
    }
  }, [queryClient])

  return { refreshing, onRefresh }
}
