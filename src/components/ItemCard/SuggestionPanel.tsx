import { Pressable, Text, View } from 'react-native'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { styles } from './styles'

export function ItemCardSuggestionPanel({
  label = 'Sugestão da IA',
  onAccept,
  onReject,
  acceptLabel,
  rejectLabel,
}: {
  label?: string
  onAccept?: () => void
  onReject?: () => void
  acceptLabel: string
  rejectLabel: string
}) {
  return (
    <View style={styles.transcriptSuggestionShell}>
      <Text style={styles.transcriptSuggestionLabel}>{label}</Text>
      <View style={styles.transcriptSuggestionActions}>
        <Pressable
          style={({ pressed }) => [
            styles.transcriptSuggestionAction,
            pressed && styles.transcriptSuggestionActionPressed,
          ]}
          onPress={onReject}
          accessibilityLabel={rejectLabel}
        >
          <Icon name="multiply" size={18} color={colors.ink.base} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.transcriptSuggestionAction,
            pressed && styles.transcriptSuggestionActionPressed,
          ]}
          onPress={onAccept}
          accessibilityLabel={acceptLabel}
        >
          <Icon name="check" size={18} color={colors.ink.base} />
        </Pressable>
      </View>
    </View>
  )
}
