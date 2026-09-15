import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { TagChipList } from '../TagChipList'
import { styles } from './styles'

export interface ChecklistCardProps {
  title: string
  itemsCount: number
  tagLabels: string[]
  applicationsCount: number
  completedCount: number
  onPress: () => void
}

/** Component/ChecklistCard */
export const ChecklistCard = memo(function ChecklistCard({
  title,
  itemsCount,
  tagLabels,
  applicationsCount,
  completedCount,
  onPress,
}: ChecklistCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && { opacity: 0.85 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${itemsCount} itens, ${applicationsCount} aplicações, ${completedCount} concluídas`}
    >
      <View style={styles.topRow}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Icon name="chevron-right" size={18} color={colors.gray[400]} />
      </View>

      <View style={styles.metaRow}>
        <Icon name="clipboard-check" size={14} color={colors.gray[400]} />
        <Text style={styles.metaText}>{itemsCount} itens</Text>
      </View>

      {tagLabels.length > 0 && (
        <TagChipList labels={tagLabels.slice(0, 3)} tone="neutral" />
      )}

      <View style={styles.bottomRow}>
        <Text style={styles.bottomText}>
          {applicationsCount} aplicações · {completedCount} concluídas
        </Text>
      </View>
    </Pressable>
  )
})
