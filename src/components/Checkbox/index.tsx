import { Pressable, Text, View } from 'react-native'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { styles } from './styles'
import { CheckboxProps } from './types'

export function Checkbox({
  label,
  checked = false,
  onToggle,
  disabled = false,
  ...props
}: CheckboxProps) {
  function handleToggle() {
    if (!disabled) onToggle?.()
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && { opacity: 0.7 }]}
      disabled={disabled}
      onPress={handleToggle}
      {...props}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Icon name="check" size={16} color={colors.white} />}
      </View>
      <Text style={[styles.label, disabled && styles.labelDisabled]}>
        {label}
      </Text>
    </Pressable>
  )
}
