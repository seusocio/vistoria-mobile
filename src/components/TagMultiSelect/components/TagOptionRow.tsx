import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Icon } from '../../Icon'
import { colors } from '@/styles'
import { styles } from '../styles'

interface TagOptionRowProps {
  label: string
  selected: boolean
  onPress: () => void
}

export const TagOptionRow = memo(function TagOptionRow({
  label,
  selected,
  onPress,
}: TagOptionRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
    >
      <Text style={selected ? styles.optionSelectedText : styles.optionText}>
        {label}
      </Text>
      <View style={[styles.check, selected && styles.checkSelected]}>
        {selected ? <Icon name="check" size={14} color={colors.white} /> : null}
      </View>
    </Pressable>
  )
})
