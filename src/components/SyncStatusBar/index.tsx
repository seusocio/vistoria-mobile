import { useIsFetching, useIsMutating } from '@tanstack/react-query'
import { MotiView } from 'moti'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUploadStore } from '@/lib/uploads/upload-store'
import { useIsOnline, useOutbox } from '@/lib/offline-queue'
import { colors } from '@/styles'
import { styles } from './styles'

/**
 * The app's only "not synced yet" indicator. Always mounted near the root;
 * only its color changes.
 *
 * It reads all three things that can be outstanding, because any one of them
 * alone tells the user the wrong story: the socket can be connected while a
 * queued write is stuck, and the outbox can be empty while three photos are
 * still uploading.
 *
 * Red specifically means *blocked*: an op at the head of the outbox has
 * exhausted its attempts, and because the queue is strictly FIFO nothing
 * behind it moves until a reconnect or foreground re-arms it. Without this,
 * that state is completely invisible.
 */
export function SyncStatusBar() {
  const { top } = useSafeAreaInsets()
  const isOnline = useIsOnline()
  const fetchingCount = useIsFetching()
  const mutatingCount = useIsMutating()
  const hasInflightRequests = fetchingCount > 0 || mutatingCount > 0
  const outboxItems = useOutbox((state) => state.items)
  const uploadsInFlight = useUploadStore((state) => state.queue.length)

  const hasFailed = outboxItems.some((item) => item.status === 'failed')
  const hasPending = outboxItems.length > 0 || uploadsInFlight > 0 || hasInflightRequests

  const color = hasFailed
    ? colors.danger.base
    : !isOnline
      ? colors.warning.base
      : hasPending
        ? colors.blue.base
        : 'transparent'

  return (
    <MotiView
      pointerEvents="none"
      accessibilityElementsHidden
      style={[styles.bar, { top }]}
      animate={{ backgroundColor: color }}
      transition={{ type: 'timing', duration: 220 }}
    />
  )
}
