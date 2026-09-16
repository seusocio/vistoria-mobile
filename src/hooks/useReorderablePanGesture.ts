import { useMemo } from 'react'
import { Gesture } from 'react-native-gesture-handler'

/**
 * Delay (ms) before an item's Pressable fires onLongPress and calls the
 * reorderable list's drag(). Must match DraggableCard's delayLongPress.
 */
export const DRAG_LONG_PRESS_DELAY = 520

/**
 * Delay (ms) before the list's own pan gesture activates. Must stay longer
 * than DRAG_LONG_PRESS_DELAY so the JS long-press timer always wins the race
 * and calls drag() first — otherwise this native gesture can activate first
 * and cancel the touch before the item's onLongPress ever fires (this raced
 * and silently lost on heavier screens when both delays were equal).
 */
const DRAG_PAN_ACTIVATION_DELAY = 900

/** Pan gesture for a NestedReorderableList/ReorderableList's `panGesture` prop. */
export function useReorderablePanGesture() {
  return useMemo(
    () => Gesture.Pan().activateAfterLongPress(DRAG_PAN_ACTIVATION_DELAY),
    [],
  )
}
