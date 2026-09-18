import { ReactNode, useState } from 'react'
import { LayoutChangeEvent, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { COLLAPSIBLE_DURATION_MS } from './contants'

interface CollapsibleProps {
  expanded: boolean
  children: ReactNode
}

/**
 * Grows/shrinks a section open instead of fading it in and out, without
 * remounting `children` on every toggle - mounting/unmounting a large
 * reorderable list (gesture handlers, worklets per row) is what made this
 * laggy once a group had 10+ items.
 *
 * There's a chicken-and-egg problem the first time a section opens: we don't
 * know its natural height until it's been laid out at least once, and it
 * can't be laid out while squeezed into an artificially small container (a
 * virtualized list won't report a usable size that way - that's what made
 * everything permanently stuck closed before this). So until the first
 * measurement, content just mounts/unmounts plainly like a normal
 * conditional (matching the list's proven-safe default behavior). Once
 * measured, it stays permanently mounted and height is driven by a shared
 * value instead, so every later toggle is just a clip animation - no remount.
 */
export function Collapsible({ expanded, children }: CollapsibleProps) {
  const [measured, setMeasured] = useState(false)
  const height = useSharedValue(0)

  function handleLayout(event: LayoutChangeEvent) {
    height.value = event.nativeEvent.layout.height
    if (!measured) setMeasured(true)
  }

  const animatedStyle = useAnimatedStyle(() => ({
    height: measured
      ? withTiming(expanded ? height.value : 0, { duration: COLLAPSIBLE_DURATION_MS })
      : undefined,
  }))

  const showChildren = measured || expanded

  return (
    <Animated.View style={[measured && styles.clip, animatedStyle]}>
      {showChildren ? <View onLayout={handleLayout}>{children}</View> : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
})
