import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Metric, SearchBar, TagChipList } from '@/components'
import { Icon } from '@/components/Icon'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import { colors } from '@/styles'
import { styles } from '../checklist-detail.styles'

interface ChecklistDetailHeaderProps {
  checklist: Checklist
  tagLabels: string[]
  applicationsCount: number
  completedCount: number
  historySearch: string
  onHistorySearchChange: (value: string) => void
  historyHasFilter: boolean
  onOpenHistorySort: () => void
}

export const ChecklistDetailHeader = memo(function ChecklistDetailHeader({
  checklist,
  tagLabels,
  applicationsCount,
  completedCount,
  historySearch,
  onHistorySearchChange,
  historyHasFilter,
  onOpenHistorySort,
}: ChecklistDetailHeaderProps) {
  return (
    <View style={styles.listHeader}>
      <View style={styles.titleCol}>
        <Text style={styles.title}>{checklist.title}</Text>
        <TagChipList labels={tagLabels} tone="neutral" />
      </View>
      {/* <View style={styles.metricsRow}>
        <Metric label="Aplicações" value={String(applicationsCount)} />
        <Metric label="Concluídas" value={String(completedCount)} />
        <Metric label="Itens/visita" value={String(checklist.items.length)} />
      </View> */}
      <View style={styles.historyRow}>
        <Text style={styles.sectionTitle}>Histórico</Text>
      </View>
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
