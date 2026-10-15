import { Pressable, Text } from 'react-native'
import { styles } from '../styles'

export function ActionButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [styles.button, danger && styles.buttonDanger, pressed && { opacity: 0.6 }]} onPress={onPress}>
      <Text style={[styles.buttonText, danger && styles.buttonTextDanger]}>{label}</Text>
    </Pressable>
  )
}
