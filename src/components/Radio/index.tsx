import { Pressable, Text, View } from 'react-native'
import { styles } from './styles'
import { RadioProps } from './types'

export function Radio({
  label,
  selected = false,
  onSelect,
  disabled = false,
  ...props
}: RadioProps) {
  const handlePress = () => {
    if (disabled) return
    onSelect?.()
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && { opacity: 0.7 }]}
      onPress={handlePress}
      disabled={disabled}
      {...props}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
      {typeof label === 'string' ? (
        <Text style={[styles.label, disabled && styles.labelDisabled]}>
          {label}
        </Text>
      ) : (
        label
      )}
    </Pressable>
  )
}
