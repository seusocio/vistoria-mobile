import { Pressable } from 'react-native'
import { ResponseSemantic } from '@/infra/domain/entities'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { styles } from './styles'

export interface ToggleProps {
  semantic: ResponseSemantic | null
  selected: boolean
  onPress: () => void
  accessibilityLabel: string
  size?: number
}

const ICON_BY_SEMANTIC: Record<
  ResponseSemantic,
  'check' | 'multiply' | 'minus'
> = {
  positivo: 'check',
  negativo: 'multiply',
  neutro: 'minus',
}

const VARIANT_STYLE = {
  positivo: styles.positive,
  negativo: styles.negative,
  neutro: styles.neutral,
}

/** Component/Toggle/Unselected, Positive, Negative, Neutral */
export function Toggle({
  semantic,
  selected,
  onPress,
  accessibilityLabel,
  size = 30,
}: ToggleProps) {
  const variantStyle =
    selected && semantic ? VARIANT_STYLE[semantic] : styles.unselected
  const icon = semantic ? ICON_BY_SEMANTIC[semantic] : 'check'
  const iconColor = selected ? colors.white : colors.gray[400]

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        variantStyle,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && { opacity: 0.7 },
      ]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
    >
      <Icon name={icon} size={size < 30 ? 12 : 14} color={iconColor} />
    </Pressable>
  )
}
