import { Pressable, Text } from 'react-native'
import { colors } from '@/styles'
import { Icon, type IconName } from '../Icon'
import { styles } from './styles'

export interface FloatingActionProps {
  label: string
  icon?: IconName
  /** Trailing reads as "go on to the next step"; leading as "do this thing". */
  iconPosition?: 'leading' | 'trailing'
  onPress: () => void
  disabled?: boolean
  accessibilityLabel?: string
}

/**
 * A screen's primary action, as a pill floating over the content rather than a
 * button in a bar pinned under it.
 *
 * The bar it replaces cost a strip of white, a top border and its own padding
 * on every screen that had one, and it cut the list off at a hard edge. A pill
 * that hugs its label gives that strip back to the content and lets the list
 * run underneath - which only works because `Screen` pads its scroll content
 * by FLOATING_ACTION_CLEARANCE, so the last row can always be scrolled clear.
 *
 * Screens pass their label and icon. The shape, the colour and the shadow are
 * not theirs to restate - four copies of a primary button is how they drift.
 */
export function FloatingAction({
  label,
  icon,
  iconPosition = 'leading',
  onPress,
  disabled = false,
  accessibilityLabel,
}: FloatingActionProps) {
  const glyph = icon ? (
    <Icon name={icon} size={18} color={colors.white} />
  ) : null

  return (
    <Pressable
      style={({ pressed }) => [
        styles.pill,
        disabled && styles.pillDisabled,
        pressed && !disabled && styles.pillPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {iconPosition === 'leading' ? glyph : null}
      <Text style={styles.label}>{label}</Text>
      {iconPosition === 'trailing' ? glyph : null}
    </Pressable>
  )
}

/**
 * Vertical space a floating action occupies, for the scroll content beneath
 * it. `Screen` applies this to its own ScrollView; a screen that brings its
 * own scroll container (a FlatList via `content`) has to apply it itself.
 */
export const FLOATING_ACTION_CLEARANCE = 96
