import { View } from 'react-native'
import { styles } from './styles'

export interface ProgressBarProps {
  progress: number
}

/** Screen/Preenchimento ProgressTrack: filled + empty rectangles side by side */
export function ProgressBar({ progress }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress))
  return (
    <View style={styles.track}>
      <View style={[styles.filled, { flex: clamped || 0.0001 }]} />
      <View style={[styles.empty, { flex: 1 - clamped || 0.0001 }]} />
    </View>
  )
}
