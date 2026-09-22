import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native'
import { useCallback } from 'react'
import { View } from 'react-native'
import { Screen } from '@/components'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import {
  useChecklistLibraryContainer,
  type UseChecklistLibraryContainerProps,
} from './checklist-library.container'
import { styles } from './checklist-library.styles'
import { ChecklistListItem } from './components/ChecklistListItem'
import { LibraryEmpty } from './components/LibraryEmpty'
import { LibraryHeader } from './components/LibraryHeader'
import { LibraryTagFilterSheet } from './components/LibraryTagFilterSheet'

const ChecklistSeparator = () => <View style={styles.itemSeparator} />

export function ChecklistLibraryView(props: UseChecklistLibraryContainerProps) {
  const c = useChecklistLibraryContainer(props)

  const renderChecklist = useCallback(
    ({ item }: LegendListRenderItemProps<Checklist>) => (
      <ChecklistListItem
        checklist={item}
        stats={
          c.applicationStatsByChecklist.get(item.id) ?? {
            applications: 0,
            completed: 0,
          }
        }
        tagLabels={c.resolveLabels(item.tagsIds)}
        onPress={c.onOpenChecklist}
      />
    ),
    [c.applicationStatsByChecklist, c.onOpenChecklist, c.resolveLabels],
  )

  return (
    <Screen
      loading={c.loading}
      variant="top"
      title="Checklists"
      subtitle="Biblioteca de modelos de vistoria"
      content={
        <>
          <LegendList
            data={c.filteredChecklists}
            renderItem={renderChecklist}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <LibraryHeader
                checklistCount={c.checklistCount}
                applicationsCount={c.applicationsCount}
                completedCount={c.completedCount}
                search={c.search}
                onSearchChange={c.onSearchChange}
                activeTagId={c.activeTagId}
                filterVisible={c.filterVisible}
                onOpenFilter={c.onOpenFilter}
                onCreateChecklist={c.onCreateChecklist}
              />
            }
            ListEmptyComponent={
              <LibraryEmpty
                hasChecklists={c.checklistCount > 0}
                hasFilters={c.hasFilters}
                onClearFilters={c.onClearFilters}
              />
            }
            ItemSeparatorComponent={ChecklistSeparator}
            estimatedItemSize={140}
            recycleItems
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentInsetAdjustmentBehavior="automatic"
          />
          <LibraryTagFilterSheet
            visible={c.filterVisible}
            onClose={c.onCloseFilter}
            filterTags={c.filterTags}
            activeTagId={c.activeTagId}
            onSelect={c.onSelectTag}
          />
        </>
      }
    />
  )
}
