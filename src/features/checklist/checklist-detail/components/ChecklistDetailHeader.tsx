import { memo } from 'react'
import { Pressable, View } from 'react-native'
import { SearchBar, TagChipList } from '@/components'
import { Icon } from '@/components/Icon'
import { colors } from '@/styles'
import { styles } from '../checklist-detail.styles'

interface ChecklistDetailHeaderProps {
  tagLabels: string[]
  historySearch: string
  onHistorySearchChange: (value: string) => void
  historyHasFilter: boolean
  onOpenHistorySort: () => void
}

export const ChecklistDetailHeader = memo(function ChecklistDetailHeader({
  tagLabels,
  historySearch,
  onHistorySearchChange,
  historyHasFilter,
  onOpenHistorySort,
}: ChecklistDetailHeaderProps) {
  return (
    <View style={styles.listHeader}>
      {tagLabels.length > 0 ? (
        <TagChipList labels={tagLabels} tone="neutral" />
      ) : null}
      <View style={styles.historySearchRow}>
        <SearchBar
          value={historySearch}
          onChangeText={onHistorySearchChange}
          placeholder="Pesquisar por tag"
        />
        <Pressable
          style={({ pressed }) => [
            styles.filterButton,
            historyHasFilter && styles.filterButtonActive,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onOpenHistorySort}
          accessibilityRole="button"
          accessibilityLabel="Ordenar histórico por tag"
        >
          <Icon
            name="filter"
            size={19}
            color={historyHasFilter ? colors.blue.base : colors.gray[600]}
          />
          {historyHasFilter ? <View style={styles.filterBadge} /> : null}
        </Pressable>
      </View>
    </View>
  )
})
