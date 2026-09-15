import { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { useCallback, useMemo, useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import {
  AppBottomSheet,
  ChecklistCard,
  Metric,
  Screen,
  SearchBar,
  TagChip,
} from '@/components'
import { Icon } from '@/components/Icon'
import { useChecklistLibrary } from '@/hooks/useChecklistLibrary'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { TabRoutesProps } from '@/routes/types'
import { colors } from '@/styles'
import { styles } from './styles'

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
      const matchesTitle = checklist.title.toLowerCase().includes(query)
      const matchesTag = labels.some((label) =>
        label.toLowerCase().includes(query),
      )
      return matchesTitle || matchesTag
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

  const renderChecklist = useCallback(
    ({ item }: { item: (typeof checklists)[number] }) => {
      const stats = applicationStatsByChecklist.get(item.id) ?? {
        applications: 0,
        completed: 0,
      }
      return (
        <ChecklistCard
          title={item.title}
          itemsCount={item.items.length}
          tagLabels={resolveLabels(item.tagsIds)}
          applicationsCount={stats.applications}
          completedCount={stats.completed}
          onPress={() =>
            navigation.navigate('checklistDetail', { checklistId: item.id })
          }
        />
      )
    },
    [applicationStatsByChecklist, navigation, resolveLabels],
  )

  const listHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        <View style={styles.metricsRow}>
          <Metric label="Modelos" value={String(checklists.length)} />
          <Metric label="Aplicações" value={String(applicationsCount)} />
          <Metric label="Concluídas" value={String(completedCount)} />
        </View>

        <Pressable
          style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
          onPress={() => navigation.navigate('checklistNew')}
          accessibilityRole="button"
          accessibilityLabel="Criar novo checklist"
        >
          <Icon name="play" size={18} color={colors.white} />
          <Text style={styles.ctaButtonText}>Criar novo checklist</Text>
        </Pressable>

        <View style={styles.searchRow}>
          <SearchBar value={search} onChangeText={setSearch} />
          <Pressable
            style={({ pressed }) => [
              styles.filterButton,
              activeTagId !== null && styles.filterButtonActive,
              pressed && styles.pressed,
            ]}
            onPress={() => setFilterVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Filtrar checklists por tag"
            accessibilityState={{ expanded: filterVisible }}
          >
            <Icon
              name="filter"
              size={20}
              color={activeTagId !== null ? colors.blue.base : colors.gray[600]}
            />
            {activeTagId !== null ? <View style={styles.filterBadge} /> : null}
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Modelos</Text>
        <AppBottomSheet
          visible={filterVisible}
          onClose={() => setFilterVisible(false)}
          snapPoints={['50%']}
        >
          <BottomSheetScrollView
            contentContainerStyle={styles.filterSheet}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.filterSheetTitle}>Filtrar modelos</Text>
            <Text style={styles.filterSheetSubtitle}>
              Mostrando checklists que usam a tag escolhida
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.filterOption,
                activeTagId === null && styles.filterOptionActive,
                pressed && styles.pressed,
              ]}
              onPress={() => {
                setActiveTagId(null)
                setFilterVisible(false)
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: activeTagId === null }}
            >
              <Text style={styles.filterOptionText}>Todos</Text>
              {activeTagId === null ? (
                <Icon name="check" size={18} color={colors.blue.base} />
              ) : null}
            </Pressable>
            {filterTags.map((tag) => (
              <Pressable
                key={tag.id}
                style={({ pressed }) => [
                  styles.filterOption,
                  activeTagId === tag.id && styles.filterOptionActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  setActiveTagId(tag.id)
                  setFilterVisible(false)
                }}
                accessibilityRole="radio"
                accessibilityLabel={`Filtrar por ${tag.label}`}
                accessibilityState={{ selected: activeTagId === tag.id }}
              >
                <TagChip
                  label={tag.label}
                  tone={activeTagId === tag.id ? 'primary' : 'neutral'}
                />
                {activeTagId === tag.id ? (
                  <Icon name="check" size={18} color={colors.blue.base} />
                ) : null}
              </Pressable>
            ))}
          </BottomSheetScrollView>
        </AppBottomSheet>
      </View>
    ),
    [
      activeTagId,
      applicationsCount,
      checklists.length,
      completedCount,
      filterTags,
      filterVisible,
      navigation,
      search,
    ],
  )

  const listEmpty = useMemo(
    () => (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>
          {checklists.length === 0
            ? 'Nenhum checklist ainda. Crie o primeiro para começar.'
            : 'Nenhum checklist encontrado para estes filtros.'}
        </Text>
        {hasFilters ? (
          <Pressable
            onPress={clearFilters}
            style={({ pressed }) => [
              styles.clearFiltersButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.clearFiltersText}>Limpar filtros</Text>
          </Pressable>
        ) : null}
      </View>
    ),
    [checklists.length, clearFilters, hasFilters],
  )

  return (
    <Screen
      loading={loading}
      variant="top"
      title="Checklists"
      subtitle="Biblioteca de modelos de vistoria"
      content={
        <FlatList
          data={filteredChecklists}
          renderItem={renderChecklist}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
        />
      }
    />
  )
}
