import { ReactNode } from 'react'
import {
  Pressable,
  PressableStateCallbackType,
  StyleProp,
  ViewStyle,
} from 'react-native'
import { DRAG_LONG_PRESS_DELAY } from '@/lib/gestures/use-reorderable-pan-gesture'

export interface DraggableCardProps {
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>)
  /** Rendered first, before children — typically a grip icon. Purely visual;
   * the whole card (not just this node) is the long-press/drag target. */
  dragHandle?: ReactNode
  onPress?: () => void
  /** Long-pressing anywhere on the card starts dragging it. Omit to disable dragging. */
  onDragStart?: () => void
  accessibilityLabel?: string
  children: ReactNode
}

/**
 * Shared drag-to-reorder shell: a Pressable whose onLongPress (after
 * DRAG_LONG_PRESS_DELAY) starts the drag, used by both checklist and
 * application item rows so the touch-target and timing stay in one place.
 * Pair with useReorderablePanGesture for the enclosing list's panGesture.
 */
export function DraggableCard({
  style,
  dragHandle,
  onPress,
  onDragStart,
  accessibilityLabel,
  children,
}: DraggableCardProps) {
  return (
    <Pressable
      style={style}
      onPress={onPress}
      onLongPress={onDragStart}
      delayLongPress={DRAG_LONG_PRESS_DELAY}
      accessibilityLabel={accessibilityLabel}
    >
      {dragHandle}
      {children}
    </Pressable>
  )
}
