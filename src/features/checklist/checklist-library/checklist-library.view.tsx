import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native'
import { useCallback } from 'react'
import { View } from 'react-native'
import { ListLoadingFooter, Screen, useFloatingTabBarClearance } from '@/components'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import { space } from '@/styles'
import { usePullToRefresh } from '@/lib/api/use-pull-to-refresh'
import {
  useChecklistLibraryContainer,
  type UseChecklistLibraryContainerProps,
} from './checklist-library.container'
import { styles } from './checklist-library.styles'
import { ChecklistListItem } from './components/ChecklistListItem'
import { LibraryEmpty } from './components/LibraryEmpty'
import { LibraryHeader } from './components/LibraryHeader'
import { LibraryTagFilterSheet } from './components/LibraryTagFilterSheet'

export function ChecklistLibraryView(props: UseChecklistLibraryContainerProps) {
  const c = useChecklistLibraryContainer(props)
  const { refreshing, onRefresh } = usePullToRefresh()
  const tabBarClearance = useFloatingTabBarClearance()

  const renderChecklist = useCallback(
    ({ item, index }: LegendListRenderItemProps<Checklist>) => (
      <ChecklistListItem
        checklist={item}
        first={index === 0}
        stats={
          c.applicationStatsByChecklist.get(item.id) ?? {
            applications: 0,
            done: 0,
            total: 0,
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
            refreshing={refreshing}
            onRefresh={onRefresh}
            data={c.filteredChecklists}
            renderItem={renderChecklist}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: space.xxl + tabBarClearance },
            ]}
            ListHeaderComponent={
              <LibraryHeader
                search={c.search}
                onSearchChange={c.onSearchChange}
                activeTagId={c.activeTagId}
                filterVisible={c.filterVisible}
                onOpenFilter={c.onOpenFilter}
              />
            }
            ListEmptyComponent={
              <LibraryEmpty
                hasChecklists={c.checklistCount > 0}
                hasFilters={c.hasFilters}
                onClearFilters={c.onClearFilters}
              />
            }
            ListFooterComponent={
              <>
                {c.filteredChecklists.length > 0 ? (
                  <View style={styles.listEndRule} />
                ) : null}
                <ListLoadingFooter loading={c.isLoadingMore} />
              </>
            }
            onEndReached={c.onEndReached}
            onEndReachedThreshold={0.2}
            estimatedItemSize={64}
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
