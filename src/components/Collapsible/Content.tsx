import { ReactNode, useEffect, useRef, useState } from 'react'
import { LayoutChangeEvent, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { COLLAPSIBLE_DURATION_MS } from './constants'
import { useCollapsible } from './context'
import { styles } from './styles'

const TIMING = { duration: COLLAPSIBLE_DURATION_MS }

export interface CollapsibleContentProps {
  children: ReactNode
}

/**
 * Clips a section open and closed. Children mount lazily on the first open and
 * then stay mounted - closing clips them away, it does not unmount them.
 *
 * That asymmetry is deliberate and load-bearing. Unmounting on close is
 * tempting (a closed group would cost nothing) but the content here contains a
 * reorderable list, and react-native-reorderable-list' ScrollViewContainer
 * shares a single `Gesture.Native()` instance between its own GestureDetector
 * and every nested list's gesture composition. RNGH assigns the handler tag
 * onto the gesture object when a detector mounts and drops it when one
 * unmounts, so tearing a list down re-registers a gesture the outer ScrollView
 * is still using - which breaks dragging outright and makes every toggle pay
 * for gesture re-attachment. Lazy-mount-once is the compromise: a group that
 * has never been opened still costs nothing, which is the case that matters on
 * a screen that starts fully collapsed.
 *
 * Height is `measuredHeight * openness` rather than a `withTiming` recomputed
 * from a shared value inside the worklet: content that grows while open (an
 * item added, a row wrapping to two lines) then resizes instantly instead of
 * kicking off a fresh animation from wherever the last one had got to.
 *
 * The measured child is absolutely positioned (see `styles.measured`) so the
 * animated height never constrains it - without that, the FlatList inside
 * would be handed a zero-height parent, report a zero layout, and the section
 * would stay shut forever.
 */
export function CollapsibleContent({ children }: CollapsibleContentProps) {
  const { expanded } = useCollapsible()
  /** Latches true on the first open and never goes back - see the note above. */
  const [mounted, setMounted] = useState(expanded)
  const measuredHeight = useSharedValue(0)
  const openness = useSharedValue(expanded ? 1 : 0)
  /** Set when an open was requested before any height was known; the next layout starts it. */
  const awaitingMeasure = useRef(false)
  const initialized = useRef(false)

  useEffect(() => {
    if (!initialized.current) {
      // First render already painted the correct state - don't animate into it.
      initialized.current = true
      return
    }

    if (expanded) {
      setMounted(true)
      if (measuredHeight.value > 0) {
        awaitingMeasure.current = false
        openness.value = withTiming(1, TIMING)
      } else {
        awaitingMeasure.current = true
      }
      return
    }

    awaitingMeasure.current = false
    openness.value = withTiming(0, TIMING)
  }, [expanded, measuredHeight, openness])

  function handleLayout(event: LayoutChangeEvent) {
    const height = event.nativeEvent.layout.height
    if (height === measuredHeight.value) return
    measuredHeight.value = height
    if (!awaitingMeasure.current) return
    awaitingMeasure.current = false
    openness.value = withTiming(1, TIMING)
  }

  const animatedStyle = useAnimatedStyle(() => ({
    height: measuredHeight.value * openness.value,
  }))

  return (
    <Animated.View style={[styles.content, animatedStyle]}>
      {mounted ? (
        <View style={styles.measured} onLayout={handleLayout}>
          {children}
        </View>
      ) : null}
    </Animated.View>
  )
}
