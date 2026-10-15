import { memo, useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Icon } from '@/components/Icon'
import {
  sharedStyles,
  styles as applicationRowStyles,
} from '@/components/ApplicationRow/styles'
import { Checklist } from '@/features/checklist/shared/checklist.types'
import { colors, textStyles } from '@/styles'
import type { ChecklistStats } from '../checklist-library.container'

interface ChecklistListItemProps {
  checklist: Checklist
  stats: ChecklistStats
  tagLabels: string[]
  /** First row in the list - drops the top rule, see ApplicationRow's `first`. */
  first: boolean
  onPress: (checklistId: string) => void
}

/**
 * One checklist in the library, drawn as the same full-bleed row as a group in
 * the checklist's history (ApplicationRow): same card shell, same marker, same
 * bar. The difference is the trailing chevron - here it navigates instead of
 * expanding, so it stays pointing right.
 */
export const ChecklistListItem = memo(function ChecklistListItem({
  checklist,
  stats,
  tagLabels,
  first,
  onPress,
}: ChecklistListItemProps) {
  const handlePress = useCallback(
    () => onPress(checklist.id),
    [checklist.id, onPress],
  )

  const itemsCount = checklist.items.length
  const meta = [
    ...(tagLabels.length > 0 ? [tagLabels.join(', ')] : []),
    `${itemsCount} ${itemsCount === 1 ? 'item' : 'itens'}`,
    `${stats.applications} ${stats.applications === 1 ? 'aplicação' : 'aplicações'}`,
  ].join('  •  ')

  return (
    <Pressable
      style={({ pressed }) => [
        sharedStyles.container,
        first && sharedStyles.containerFirst,
        styles.row,
        pressed && sharedStyles.rowPressed,
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Abrir checklist ${checklist.title}`}
    >
      <View style={applicationRowStyles.marker}>
        <Icon name="clipboard-check" size={16} color={colors.blue.base} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={1}>
          {checklist.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Icon name="chevron-right" size={14} color={colors.gray[400]} />
    </Pressable>
  )
})

// Mirrors Collapsible's card-variant bar, so a library row and a history group
// line up to the pixel.
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  title: {
    ...textStyles.itemTitle,
  },
  meta: {
    ...textStyles.metaLabel,
  },
})
