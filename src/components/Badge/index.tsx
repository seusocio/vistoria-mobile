import { Text, View } from 'react-native'
import { styles } from './styles'

export type BadgeTone = 'draft' | 'completed'

export interface BadgeProps {
  label: string
  tone?: BadgeTone
}

/** Component/Badge/Draft and Component/Badge/Completed */
export function Badge({ label, tone = 'draft' }: BadgeProps) {
  return (
    <View
      style={[
        styles.container,
        tone === 'draft' ? styles.draft : styles.completed,
      ]}
    >
      <Text
        style={[
          styles.label,
          tone === 'draft' ? styles.draftLabel : styles.completedLabel,
        ]}
      >
        {label}
      </Text>
    </View>
  )
}
