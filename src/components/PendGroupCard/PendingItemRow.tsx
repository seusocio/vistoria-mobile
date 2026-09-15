import { memo } from 'react'
import { Text, View } from 'react-native'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { styles } from './styles'

export const PendingItemRow = memo(function PendingItemRow({
  title,
}: {
  title: string
}) {
  return (
    <View style={styles.itemRow}>
      <Icon name="alert-triangle" size={14} color={colors.warning.base} />
      <Text style={styles.itemText}>{title}</Text>
    </View>
  )
})
