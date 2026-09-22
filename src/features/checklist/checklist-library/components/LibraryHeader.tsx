import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Icon } from '@/components/Icon'
import { Metric, SearchBar } from '@/components'
import { colors } from '@/styles'
import { styles } from '../checklist-library.styles'

interface LibraryHeaderProps {
  checklistCount: number
  applicationsCount: number
  completedCount: number
  search: string
  onSearchChange: (value: string) => void
  activeTagId: string | null
  filterVisible: boolean
  onOpenFilter: () => void
  onCreateChecklist: () => void
}

export const LibraryHeader = memo(function LibraryHeader({
  checklistCount,
  applicationsCount,
  completedCount,
  search,
  onSearchChange,
  activeTagId,
  filterVisible,
  onOpenFilter,
  onCreateChecklist,
}: LibraryHeaderProps) {
  return (
    <View style={styles.listHeader}>
      <View style={styles.metricsRow}>
        <Metric label="Modelos" value={String(checklistCount)} />
        <Metric label="Aplicações" value={String(applicationsCount)} />
        <Metric label="Concluídas" value={String(completedCount)} />
      </View>
      <Pressable
        style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
        onPress={onCreateChecklist}
        accessibilityRole="button"
        accessibilityLabel="Criar novo checklist"
      >
        <Text style={styles.ctaButtonText}>Criar novo checklist</Text>
      </Pressable>
      <View style={styles.searchRow}>
        <SearchBar value={search} onChangeText={onSearchChange} />
        <Pressable
          style={({ pressed }) => [
            styles.filterButton,
            activeTagId !== null && styles.filterButtonActive,
            pressed && styles.pressed,
          ]}
          onPress={onOpenFilter}
          accessibilityRole="button"
          accessibilityLabel="Filtrar checklists por tag"
          accessibilityState={{ expanded: filterVisible }}
        >
          <Icon
            name="filter"
            size={19}
            color={activeTagId !== null ? colors.blue.base : colors.gray[600]}
          />
          {activeTagId !== null ? <View style={styles.filterBadge} /> : null}
        </Pressable>
      </View>
      <Text style={styles.sectionTitle}>Modelos</Text>
    </View>
  )
})
