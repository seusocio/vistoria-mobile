import { Pressable } from 'react-native'
import { colors } from '@/styles'
import { Icon, type IconName } from '../Icon'
import { styles } from './styles'

export function ItemCardTrailingButton({
  icon,
  onPress,
  accessibilityLabel,
  color = colors.gray[600],
  hitSlop = 12,
}: {
  icon: IconName
  onPress?: () => void
  accessibilityLabel: string
  color?: string
  hitSlop?: number
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.trailingButton, pressed && { opacity: 0.7 }]}
      hitSlop={hitSlop}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
    >
      <Icon name={icon} size={18} color={color} />
    </Pressable>
  )
}
