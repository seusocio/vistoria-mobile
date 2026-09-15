import { memo } from 'react'
import { Text, View } from 'react-native'
import { TagChipList } from '../TagChipList'
import { PendingItemRow } from './PendingItemRow'
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
          <TagChipList labels={tagLabels} />
        </View>
        <Text style={styles.dateText}>{dateLabel}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.itemsList}>
        {itemTitles.map((title) => (
          <PendingItemRow key={title} title={title} />
        ))}
      </View>
    </View>
  )
})
