import { memo } from 'react'
import { Pressable, View } from 'react-native'
import { Icon } from '@/components/Icon'
import { SearchBar } from '@/components'
import { colors } from '@/styles'
import { styles } from '../checklist-library.styles'

interface LibraryHeaderProps {
  search: string
  onSearchChange: (value: string) => void
  activeTagId: string | null
  filterVisible: boolean
  onOpenFilter: () => void
}

export const LibraryHeader = memo(function LibraryHeader({
  search,
  onSearchChange,
  activeTagId,
  filterVisible,
  onOpenFilter,
}: LibraryHeaderProps) {
  return (
    <View style={styles.listHeader}>
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
    </View>
  )
})
