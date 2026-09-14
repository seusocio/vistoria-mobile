import { Pressable, Text, View } from 'react-native'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { styles } from './styles'

export interface TagChipProps {
  label: string
  /** Z2LGG (primary, blue tint) or okcUJ (neutral, gray) */
  tone?: 'primary' | 'neutral'
  onRemove?: () => void
}

export function TagChip({ label, tone = 'primary', onRemove }: TagChipProps) {
  const isPrimary = tone === 'primary'
  return (
    <View
      style={[styles.container, isPrimary ? styles.primary : styles.neutral]}
    >
      <Text
        style={[
          styles.label,
          isPrimary ? styles.primaryLabel : styles.neutralLabel,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {onRemove && (
        <Pressable
          style={({ pressed }) => pressed && { opacity: 0.7 }}
          onPress={onRemove}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={`Remover tag ${label}`}
        >
          <Icon
            name="multiply"
            size={12}
            color={isPrimary ? colors.blue.base : colors.gray[400]}
          />
        </Pressable>
      )}
    </View>
  )
}
