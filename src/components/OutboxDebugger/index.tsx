import { useState } from 'react'
import { Modal, Pressable, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import { useOutbox } from '@/lib/offline-queue'
import { useUploadStore } from '@/lib/uploads/upload-store'
import { colors } from '@/styles'
import { DebuggerSheet } from './components/DebuggerSheet'
import { styles } from './styles'

/**
 * On-device view into the offline write path: the outbox (with each op's
 * args and last error), the upload queue (with the session flags that decide
 * whether a job runs), the React Query cache the overlay reads from, and
 * what the drain did recently. Opened from the pill
 * under the sync bar; behind `FEATURE_FLAG.outboxDebugger`.
 */
export function OutboxDebugger() {
  const [open, setOpen] = useState(false)
  const { top } = useSafeAreaInsets()
  const items = useOutbox((state) => state.items)
  const uploads = useUploadStore((state) => state.queue.length)

  if (!FEATURE_FLAG.outboxDebugger) return null

  const failed = items.some((item) => item.status === 'failed')
  const pillColor = failed ? colors.danger.base : items.length > 0 || uploads > 0 ? colors.blue.base : colors.gray[400]

  return (
    <>
      <Pressable
        style={[styles.pill, { top: top + 6, backgroundColor: pillColor }]}
        onPress={() => setOpen(true)}
        hitSlop={12}
      >
        <Text style={styles.pillText}>
          {failed ? '⚠ ' : ''}
          {items.length} ops · {uploads} up
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <DebuggerSheet onClose={() => setOpen(false)} />
      </Modal>
    </>
  )
}
