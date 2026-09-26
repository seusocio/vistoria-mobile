import { useNetworkState } from 'expo-network'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { drainOutbox, retryFailedOps } from './process-queue'
import { useOutbox } from './queue.store'

/**
 * True once the device radio has a link. This is a weaker signal than the
 * old Convex socket state — "the backend is answering" — but the two
 * consumers (the overlay, the drain's reconnect trigger) both tolerate the
 * difference: a site wifi with a captive portal reads online and isn't, and
 * the overlay just waits one beat longer while a retry fails into backoff.
 * No health-check is built for this on purpose.
 */
export function useIsOnline(): boolean {
  const { isConnected } = useNetworkState()
  return isConnected === true
}

/**
 * Mount once near the root. Drains the outbox at the four moments a pending
 * write actually has a chance of going through: when the persisted queue
 * finishes hydrating from AsyncStorage, whenever the network reconnects,
 * whenever the app comes back to the foreground, and — via `enqueueOp` —
 * whenever a new op is written anywhere in the app.
 *
 * Reconnect and foreground go through `retryFailedOps` rather than a plain
 * drain: an op that burned its attempts is almost always one that ran out of
 * network, and the head of the queue blocks everything behind it until
 * something gives it another budget.
 */
export function useOutboxLifecycle(): void {
  const isOnline = useIsOnline()

  // Hydration is async: on a cold start the store is empty for a beat, so
  // draining only on mount would miss the whole persisted queue.
  useEffect(() => {
    if (useOutbox.persist.hasHydrated()) void retryFailedOps()
    return useOutbox.persist.onFinishHydration(() => void retryFailedOps())
  }, [])

  useEffect(() => {
    if (isOnline) void retryFailedOps()
  }, [isOnline])

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
