import { memo } from 'react'
import { Text, View } from 'react-native'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { TagChip } from '../TagChip'
import { styles } from './styles'

export interface PendGroupCardProps {
  tagLabels: string[]
  dateLabel: string
  itemTitles: string[]
}

/** Component/PendGroupCard */
export const PendGroupCard = memo(function PendGroupCard({
  tagLabels,
  dateLabel,
  itemTitles,
}: PendGroupCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.tagsRow}>
          {tagLabels.map((label) => (
            <TagChip key={label} label={label} />
          ))}
        </View>
        <Text style={styles.dateText}>{dateLabel}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.itemsList}>
        {itemTitles.map((title) => (
          <View key={title} style={styles.itemRow}>
            <Icon name="alert-triangle" size={14} color={colors.warning.base} />
            <Text style={styles.itemText}>{title}</Text>
          </View>
        ))}
      </View>
    </View>
  )
})
