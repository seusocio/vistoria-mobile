import { useConvexConnectionState } from 'convex/react'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { drainOutbox, retryFailedOps } from './process-queue'
import { useOutbox } from './queue.store'
import { hydrateSnapshots } from './snapshot.store'

/**
 * Mount once near the root, inside `ConvexProvider` (it reads the connection
 * state). Drains the outbox at the four moments a pending write actually has
 * a chance of going through: when the persisted queue finishes hydrating
 * from AsyncStorage, whenever the socket reconnects, whenever the app comes
 * back to the foreground, and — via `enqueueOp` — whenever a new op is
 * written anywhere in the app.
 *
 * Reconnect and foreground go through `retryFailedOps` rather than a plain
 * drain: an op that burned its attempts is almost always one that ran out of
 * network, and the head of the queue blocks everything behind it until
 * something gives it another budget.
 */
export function useOutboxLifecycle(): void {
  const { isWebSocketConnected } = useConvexConnectionState()

  // Reads the persisted query snapshots. Until this resolves, screens with
  // no server answer can't tell "no cache" from "cache not read yet", so
  // they wait — keep it first and keep it cheap.
  useEffect(() => {
    void hydrateSnapshots()
  }, [])

  // Hydration is async: on a cold start the store is empty for a beat, so
  // draining only on mount would miss the whole persisted queue.
  useEffect(() => {
    if (useOutbox.persist.hasHydrated()) void retryFailedOps()
    return useOutbox.persist.onFinishHydration(() => void retryFailedOps())
  }, [])

  useEffect(() => {
    if (isWebSocketConnected) void retryFailedOps()
  }, [isWebSocketConnected])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void retryFailedOps()
    })
    return () => subscription.remove()
  }, [])

  // A drain can also be needed without any of the above firing — an op
  // enqueued while a previous drain was mid-flight, for instance.
  useEffect(
    () =>
      useOutbox.subscribe((state, previous) => {
        if (state.items.length > previous.items.length) void drainOutbox()
      }),
    [],
  )
}
