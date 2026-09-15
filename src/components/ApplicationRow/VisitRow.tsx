import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import type { ApplicationRowEntry } from './index'
import { styles } from './styles'

export const VisitRow = memo(function VisitRow({
  entry,
  strong = false,
  onPress,
}: {
  entry: ApplicationRowEntry
  strong?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.visitRow, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <Text style={strong ? styles.dateTextStrong : styles.dateText}>
        {entry.dateLabel}
      </Text>
      {entry.negativeCount > 0 ? (
        <View style={[styles.negPill, styles.negPillWarning]}>
          <Icon name="alert-triangle" size={12} color={colors.warning.base} />
          <Text style={styles.negPillWarningText}>
            {entry.negativeCount} negativas
          </Text>
        </View>
      ) : (
        <View style={[styles.negPill, styles.negPillSuccess]}>
          <Icon name="check" size={12} color={colors.success.base} />
          <Text style={styles.negPillSuccessText}>Sem negativas</Text>
        </View>
      )}
    </Pressable>
  )
})
