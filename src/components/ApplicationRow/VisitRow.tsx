import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import type { ApplicationRowEntry } from './types'
import { sharedStyles, styles } from './styles'

export const VisitRow = memo(function VisitRow({
  entry,
  strong = false,
  divided = false,
  onPress,
}: {
  entry: ApplicationRowEntry
  strong?: boolean
  /** Hairline beneath the row. Off for the last one - the button below it closes the card. */
  divided?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.visitRow,
        divided && styles.visitRowDivided,
        pressed && sharedStyles.rowPressed,
      ]}
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
      {/* The row opens the vistoria; at full width that needs saying. */}
      <Icon name="chevron-right" size={14} color={colors.gray[400]} />
    </Pressable>
  )
})
