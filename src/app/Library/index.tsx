import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { ChecklistCard, Metric, Screen, SearchBar, TagChip } from '@/components'
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

  return (
    <Screen
      loading={loading}
      variant="top"
      title="Checklists"
      subtitle="Biblioteca de modelos de vistoria"
    >
      <View style={styles.metricsRow}>
        <Metric label="Modelos" value={String(checklists.length)} />
        <Metric label="Aplicações" value={String(applicationsCount)} />
        <Metric label="Concluídas" value={String(completedCount)} />
      </View>

      <Pressable
        style={({ pressed }) => [styles.ctaButton, pressed && { opacity: 0.7 }]}
        onPress={() => navigation.navigate('checklistNew')}
      >
        <Icon name="play" size={18} color={colors.white} />
        <Text style={styles.ctaButtonText}>Continuar ou iniciar vistoria</Text>
      </Pressable>

      <SearchBar value={search} onChangeText={setSearch} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <Pressable
          style={({ pressed }) => pressed && { opacity: 0.7 }}
          onPress={() => setActiveTagId(null)}
        >
          <View
            style={[
              styles.allChip,
              activeTagId === null && styles.allChipActive,
            ]}
          >
            <Text
              style={[
                styles.allChipText,
                activeTagId === null && styles.allChipTextActive,
              ]}
            >
              Todos
            </Text>
          </View>
        </Pressable>
        {filterTags.map((tag) => (
          <Pressable
            key={tag.id}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
            onPress={() => setActiveTagId(tag.id)}
          >
            <TagChip
              label={tag.label}
              tone={activeTagId === tag.id ? 'primary' : 'neutral'}
            />
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.sectionTitle}>Modelos</Text>

      {filteredChecklists.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {checklists.length === 0
              ? 'Nenhum checklist ainda. Crie o primeiro para começar.'
              : 'Nenhum checklist encontrado para esta busca.'}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {filteredChecklists.map((checklist) => {
            const checklistApplications = applications.filter(
              (application) => application.checklistId === checklist.id,
            )
            return (
              <ChecklistCard
                key={checklist.id}
                title={checklist.title}
                itemsCount={checklist.items.length}
                tagLabels={resolveLabels(checklist.tagsIds)}
                applicationsCount={checklistApplications.length}
                completedCount={
                  checklistApplications.filter((a) => a.status === 'completed')
                    .length
                }
                onPress={() =>
                  navigation.navigate('checklistDetail', {
                    checklistId: checklist.id,
                  })
                }
              />
            )
          })}
        </View>
      )}
    </Screen>
  )
}
