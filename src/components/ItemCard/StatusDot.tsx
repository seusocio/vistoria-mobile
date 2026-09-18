import { Pressable, StyleSheet } from 'react-native'
import { colors } from '@/styles'
import { haptics } from '@/utils/haptics'
import { Icon } from '../Icon'

export type ItemCompletionVariant =
  | 'idle'
  | 'completed'
  | 'in_progress'
  | 'in_review'
  | 'denied'

export const ITEM_COMPLETION_VARIANT_COLOR: Record<ItemCompletionVariant, string> = {
  idle: colors.gray[400],
  completed: colors.success.base,
  in_progress: colors.info.base,
  in_review: colors.warning.base,
  denied: colors.danger.base,
}

/**
 * Linear draws its Todo/In Progress/In Review status icons as an outline
 * ring, but Done and Canceled - the two terminal states - are solid filled
 * circles with a check/x cut out of the fill. Same idea here: idle and the
 * still-in-flight extras stay outline rings, the two terminal outcomes fill.
 */
const FILLED_VARIANT_ICON: Partial<Record<ItemCompletionVariant, 'check' | 'multiply'>> = {
  completed: 'check',
  denied: 'multiply',
}

/**
 * Leading completion indicator, its own touch target on the row. Tap toggles
 * the binary complete/not-complete state; the other statuses (in progress/in
 * review/denied) are picked from the item's bottom sheet instead of a hidden
 * gesture here - a row of options you can actually see beats a long-press
 * nobody discovers.
 */
export function ItemCardStatusDot({
  variant,
  onPress,
  accessibilityLabel,
}: {
  variant: ItemCompletionVariant
  onPress: () => void
  accessibilityLabel: string
}) {
  const color = ITEM_COMPLETION_VARIANT_COLOR[variant]
  const filledIcon = FILLED_VARIANT_ICON[variant]

  return (
    <Pressable
      style={({ pressed }) => [
        styles.dot,
        filledIcon
          ? { backgroundColor: color, borderColor: color }
          : { borderColor: color },
        pressed && styles.pressed,
      ]}
      hitSlop={12}
      onPress={() => {
        haptics.selection()
        onPress()
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {filledIcon ? <Icon name={filledIcon} size={12} color={colors.white} /> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderCurve: 'continuous',
    borderWidth: 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
})
