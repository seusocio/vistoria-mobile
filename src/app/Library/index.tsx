import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native'
import { useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
import { Screen } from '@/components'
import { useChecklistLibrary } from '@/hooks/useChecklistLibrary'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import type { Checklist } from '@/infra/domain/entities'
import { TabRoutesProps } from '@/routes/types'
import { styles } from './styles'
import { ChecklistListItem } from './components/ChecklistListItem'
import { LibraryEmpty } from './components/LibraryEmpty'
import { LibraryHeader } from './components/LibraryHeader'
import { LibraryTagFilterSheet } from './components/LibraryTagFilterSheet'

const ChecklistSeparator = () => <View style={styles.itemSeparator} />

export function Library({ navigation }: TabRoutesProps<'home'>) {
  const {
    checklists,
    applications,
    applicationsCount,
    completedCount,
    loading,
  } = useChecklistLibrary()
  const { tagsById, resolveLabels } = useTagsCatalog()
  const [search, setSearch] = useState('')
  const [activeTagId, setActiveTagId] = useState<string | null>(null)
  const [filterVisible, setFilterVisible] = useState(false)
  const hasFilters = search.trim().length > 0 || activeTagId !== null

  const clearFilters = useCallback(() => {
    setSearch('')
    setActiveTagId(null)
  }, [])

  const filterTags = useMemo(() => {
    const ids = new Set<string>()
    for (const checklist of checklists) {
      for (const tagId of checklist.tagsIds) ids.add(tagId)
    }
    return Array.from(ids)
      .map((id) => tagsById.get(id))
      .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
  }, [checklists, tagsById])

  const filteredChecklists = useMemo(() => {
    const query = search.trim().toLowerCase()
    return checklists.filter((checklist) => {
      const labels = resolveLabels(checklist.tagsIds)
      if (activeTagId && !checklist.tagsIds.includes(activeTagId)) return false
      if (!query) return true
      return (
        checklist.title.toLowerCase().includes(query) ||
        labels.some((label) => label.toLowerCase().includes(query))
      )
    })
  }, [checklists, search, activeTagId, resolveLabels])

  const applicationStatsByChecklist = useMemo(() => {
    const stats = new Map<string, { applications: number; completed: number }>()
    for (const application of applications) {
      const current = stats.get(application.checklistId) ?? {
        applications: 0,
        completed: 0,
      }
      current.applications += 1
      if (application.status === 'completed') current.completed += 1
      stats.set(application.checklistId, current)
    }
    return stats
  }, [applications])

  const handleChecklistPress = useCallback(
    (checklistId: string) => {
      navigation.navigate('checklistDetail', { checklistId })
    },
    [navigation],
  )
  const renderChecklist = useCallback(
    ({ item }: LegendListRenderItemProps<Checklist>) => (
      <ChecklistListItem
        checklist={item}
        stats={
          applicationStatsByChecklist.get(item.id) ?? {
            applications: 0,
            completed: 0,
          }
        }
        tagLabels={resolveLabels(item.tagsIds)}
        onPress={handleChecklistPress}
      />
    ),
    [applicationStatsByChecklist, handleChecklistPress, resolveLabels],
  )
  const handleSelectTag = useCallback((tagId: string | null) => {
    setActiveTagId(tagId)
    setFilterVisible(false)
  }, [])
  const handleCreateChecklist = useCallback(() => {
    navigation.navigate('checklistNew')
  }, [navigation])

  return (
    <Screen
      loading={loading}
      variant="top"
      title="Checklists"
      subtitle="Biblioteca de modelos de vistoria"
      content={
        <>
          <LegendList
            data={filteredChecklists}
            renderItem={renderChecklist}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <LibraryHeader
                checklistCount={checklists.length}
                applicationsCount={applicationsCount}
                completedCount={completedCount}
                search={search}
                onSearchChange={setSearch}
                activeTagId={activeTagId}
                filterVisible={filterVisible}
                onOpenFilter={() => setFilterVisible(true)}
                onCreateChecklist={handleCreateChecklist}
              />
            }
            ListEmptyComponent={
              <LibraryEmpty
                hasChecklists={checklists.length > 0}
                hasFilters={hasFilters}
                onClearFilters={clearFilters}
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
            visible={filterVisible}
            onClose={() => setFilterVisible(false)}
            filterTags={filterTags}
            activeTagId={activeTagId}
            onSelect={handleSelectTag}
          />
        </>
      }
    />
  )
}
