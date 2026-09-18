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

/**
 * Pan gesture for a NestedReorderableList/ReorderableList's `panGesture` prop.
 *
 * Call this once per list, inside the component that renders it. It must NOT
 * be hoisted to the screen and shared between sections: the list takes the
 * instance you pass and chains `.onBegin().onUpdate().onEnd().onFinalize()`
 * onto it, and RNGH's builder methods mutate the gesture in place. Share one
 * instance across N lists and each list overwrites the previous list's
 * handlers with worklets closing over its own shared values - the last one
 * mounted wins, every other list drags the wrong state - while N
 * GestureDetectors all re-attach the same handler on every mount.
 */
export function useReorderablePanGesture() {
  return useMemo(
    () => Gesture.Pan().activateAfterLongPress(DRAG_PAN_ACTIVATION_DELAY),
    [],
  )
}
