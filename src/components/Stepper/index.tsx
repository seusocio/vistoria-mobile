import { Pressable, Text, View } from 'react-native'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { styles } from './styles'

export interface StepperProps {
  value: number
  onChange: (value: number) => void
}

/** Component/Stepper */
export function Stepper({ value, onChange }: StepperProps) {
  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
        onPress={() => onChange(Math.max(0, value - 1))}
        accessibilityLabel="Diminuir quantidade"
      >
        <Icon name="minus" size={14} color={colors.ink.base} />
      </Pressable>
      <Text style={styles.value}>{value}</Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
        onPress={() => onChange(value + 1)}
        accessibilityLabel="Aumentar quantidade"
      >
        <Icon name="plus" size={14} color={colors.ink.base} />
      </Pressable>
    </View>
  )
}
