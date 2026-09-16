import { ReactNode } from 'react'
import { PressableStateCallbackType, StyleProp, View, ViewStyle } from 'react-native'
import { DraggableCard, type DraggableCardProps } from '../DraggableCard'
import { styles } from './styles'

export interface ItemCardRootProps {
  style?: DraggableCardProps['style']
  /** Extra style for the outer shell, e.g. a highlighted background/padding state. */
  shellStyle?: StyleProp<ViewStyle>
  onPress?: () => void
  /** Long-pressing anywhere on the card starts dragging it. Omit to disable dragging. */
  onDragStart?: () => void
  accessibilityLabel?: string
  /** Rendered below the card, inside the shell — e.g. a suggestion panel. */
  footer?: ReactNode
  children: ReactNode
}

/**
 * Card shell shared by checklist and application item rows: the long-press-to-drag
 * Pressable plus the outer rounded shell. Each row composes its own content as
 * children — only the drag mechanics and container styling live here.
 *
 * Appear/disappear/reposition animation is owned by the enclosing
 * NestedReorderableList (its `itemLayoutAnimation` prop), not this shell,
 * since the list is what actually controls when an item mounts, unmounts, or
 * changes position.
 */
export function ItemCardRoot({
  style,
  shellStyle,
  onPress,
  onDragStart,
  accessibilityLabel,
  footer,
  children,
}: ItemCardRootProps) {
  const resolvedStyle =
    typeof style === 'function'
      ? (state: PressableStateCallbackType) => [styles.container, style(state)]
      : [styles.container, style]

  return (
    <View style={[styles.itemShell, shellStyle]}>
      <DraggableCard
        style={resolvedStyle}
        onPress={onPress}
        onDragStart={onDragStart}
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </DraggableCard>
      {footer}
    </View>
  )
}
