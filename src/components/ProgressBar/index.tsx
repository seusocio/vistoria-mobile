import { MotiView } from 'moti'
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
      <MotiView
        style={styles.filled}
        animate={{ flex: clamped || 0.0001 }}
        transition={{ type: 'timing', duration: 220 }}
      />
      <MotiView
        style={styles.empty}
        animate={{ flex: 1 - clamped || 0.0001 }}
        transition={{ type: 'timing', duration: 220 }}
      />
    </View>
  )
}
