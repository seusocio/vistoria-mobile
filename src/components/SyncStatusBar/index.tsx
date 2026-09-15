import { useConvexConnectionState } from 'convex/react'
import { MotiView } from 'moti'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/styles'
import { styles } from './styles'

/** Always mounted near the root; only its color changes with sync state. */
export function SyncStatusBar() {
  const { top } = useSafeAreaInsets()
  const { isWebSocketConnected, hasInflightRequests } = useConvexConnectionState()

  const color = !isWebSocketConnected
    ? colors.warning.base
    : hasInflightRequests
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
