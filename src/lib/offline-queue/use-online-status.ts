import { useConvexConnectionState } from 'convex/react'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { drainOutbox } from './process-queue'
import { useOutbox } from './queue.store'

let bootDrainStarted = false

/**
 * Mount once near the root (alongside `SyncStatusBar`). Drains the outbox
 * on boot, whenever the socket reconnects, whenever the app comes back to
 * the foreground, and whenever a new op is enqueued anywhere in the app —
 * the four moments a pending write actually has a chance of going through.
 */
export function useOutboxLifecycle(): void {
  const { isWebSocketConnected } = useConvexConnectionState()

  useEffect(() => {
    if (isWebSocketConnected) void drainOutbox()
  }, [isWebSocketConnected])

  useEffect(() => {
    if (bootDrainStarted) return
    bootDrainStarted = true
    void drainOutbox()
    return useOutbox.subscribe((state, previous) => {
      if (state.items.length > previous.items.length) void drainOutbox()
    })
  }, [])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainOutbox()
    })
    return () => subscription.remove()
  }, [])
}
