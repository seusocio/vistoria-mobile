import { BottomSheetView } from '@gorhom/bottom-sheet'
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  AppBottomSheet,
  ConfirmBottomSheet,
  Screen,
  TagMultiSelect,
} from '@/components'
import { useSheetFooterActions } from '@/components/SheetFooterActions'
import { Icon } from '@/components/Icon'
import { useApplicationMutations } from '@/hooks/useApplicationMutations'
import { useChecklistDetail } from '@/hooks/useChecklistDetail'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import {
  buildRepeatedApplication,
  countNegativeAnswers,
  duplicateChecklist,
  groupApplicationsByTagSet,
  softDeleteChecklist,
} from '@/infra/services'
import type { ApplicationRowEntry } from '@/components/ApplicationRow'
import { StackRoutesProps } from '@/routes/types'
import { colors } from '@/styles'
import { formatBrDateShort } from '@/utils/date'
import { styles } from './styles'
import { ApplicationGroupRow } from './components/ApplicationGroupRow'
import { ChecklistDetailHeader } from './components/ChecklistDetailHeader'

const GroupSeparator = () => <View style={styles.listSeparator} />

export function ChecklistDetail({
  navigation,
  route,
}: StackRoutesProps<'checklistDetail'>) {
  const { checklistId } = route.params
  const { checklist, applications, loading } = useChecklistDetail(checklistId)
  const { resolveLabels, activeTags, tagsById, createTag } = useTagsCatalog()
  const mutations = useApplicationMutations()
  const submitted = useRef(false)
  const groups = useMemo(
    () =>
      checklist
        ? groupApplicationsByTagSet(applications).map((group) => ({
            ...group,
            entries: group.applications.map((application): ApplicationRowEntry => ({
              id: application.id,
              dateLabel: formatBrDateShort(application.date),
              negativeCount: countNegativeAnswers(application, checklist),
            })),
          }))
        : [],
    [applications, checklist],
  )
  const [deleteConfirmationVisible, setDeleteConfirmationVisible] =
    useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editingGroup, setEditingGroup] = useState<
    (typeof groups)[number] | null
  >(null)
  const [draftGroupTags, setDraftGroupTags] = useState<string[]>([])
  const [batchError, setBatchError] = useState<string | null>(null)
  const [savingBatch, setSavingBatch] = useState(false)

  const completedCount = applications.filter(
    (application) => application.status === 'completed',
  ).length

  async function handleDuplicate() {
    if (!checklist || submitted.current) return
    submitted.current = true
    try {
      const copy = await duplicateChecklist(checklistId)
      navigation.replace('checklistDetail', { checklistId: copy.id })
    } finally {
      submitted.current = false
    }
  }

  function handleDelete() {
    setDeleteConfirmationVisible(true)
  }

  function confirmDelete() {
    if (deleting) return
    setDeleting(true)
    void softDeleteChecklist(checklistId).catch(() => setDeleting(false))
    setDeleteConfirmationVisible(false)
    navigation.navigate('tabs', { screen: 'home' })
  }

  const handleOpenBatchEdit = useCallback(
    (group: (typeof groups)[number]) => {
      setEditingGroup(group)
      setDraftGroupTags(group.tagsIds)
      setBatchError(null)
    },
    [],
  )

  function handleSaveBatchEdit() {
    if (!editingGroup) return
    if (draftGroupTags.length === 0) {
      setBatchError('Selecione ao menos uma tag')
      return
    }
    setSavingBatch(true)
    setBatchError(null)
    const updatedAt = new Date().toISOString()
    void mutations
      .setTagsForMany({
        applicationIds: editingGroup.applications.map((application) => application.id),
        tagsIds: draftGroupTags,
        updatedAt,
      })
      .then(() => setEditingGroup(null))
      .catch(() => setBatchError('Não foi possível salvar as tags'))
      .finally(() => setSavingBatch(false))
  }
  const footerComponent = useSheetFooterActions({
    confirmLabel: savingBatch ? 'Salvando...' : 'Aplicar às aplicações',
    onConfirm: handleSaveBatchEdit,
    confirming: savingBatch,
  })


  const handleOpenEntry = useCallback(
    (applicationId: string) => {
      navigation.navigate('applicationFill', { checklistId, applicationId })
    },
    [checklistId, navigation],
  )
  const handleRepeat = useCallback(
    (groupApplications: typeof applications) => {
      if (!checklist || submitted.current || groupApplications.length === 0) return
      submitted.current = true
      const newApplication = buildRepeatedApplication(groupApplications[0], checklist)
      void mutations
        .create({ entity: newApplication })
        .catch(() => setBatchError('Não foi possível repetir a aplicação'))
      navigation.navigate('applicationFill', {
        checklistId,
        applicationId: newApplication.id,
      })
    },
    [checklist, checklistId, mutations, navigation],
  )
  const renderGroup = useCallback(
    ({ item, index }: LegendListRenderItemProps<(typeof groups)[number]>) => (
      <ApplicationGroupRow
        group={item}
        tagLabels={resolveLabels(item.tagsIds)}
        defaultExpanded={index === 0}
        onOpenEntry={handleOpenEntry}
        onRepeat={handleRepeat}
        onEditTags={handleOpenBatchEdit}
      />
    ),
    [handleOpenBatchEdit, handleOpenEntry, handleRepeat, resolveLabels],
  )

  return (
    <Screen
      loading={loading || !checklist}
      variant="nested"
      onBack={() => navigation.goBack()}
      title="Checklist"
      footer={
        checklist ? (
          <Pressable
            style={({ pressed }) => [styles.newAppButton, pressed && { opacity: 0.7 }]}
            onPress={() => navigation.navigate('applicationNew', { checklistId })}
          >
            <Icon name="plus" size={18} color={colors.white} />
            <Text style={styles.newAppButtonText}>Nova aplicação</Text>
          </Pressable>
        ) : undefined
      }
      headerRight={
        checklist ? (
          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [styles.headerActionButton, pressed && { opacity: 0.7 }]}
              onPress={() => navigation.navigate('checklistEdit', { checklistId })}
              accessibilityLabel="Editar checklist"
            >
              <Icon name="edit-pen" size={16} color={colors.ink.base} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.headerActionButton, pressed && { opacity: 0.7 }]}
              onPress={handleDuplicate}
              accessibilityLabel="Duplicar checklist"
            >
              <Icon name="copy" size={16} color={colors.ink.base} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.headerActionButton, pressed && { opacity: 0.7 }]}
              onPress={handleDelete}
              accessibilityLabel="Excluir checklist"
            >
              <Icon name="trash-2" size={16} color={colors.danger.base} />
            </Pressable>
          </View>
        ) : undefined
      }
      content={
        <>
          <LegendList
            data={groups}
            renderItem={renderGroup}
            keyExtractor={(item) => item.key}
            ListHeaderComponent={
              checklist ? (
                <ChecklistDetailHeader
                  checklist={checklist}
                  tagLabels={resolveLabels(checklist.tagsIds)}
                  applicationsCount={applications.length}
                  completedCount={completedCount}
                />
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  Nenhuma aplicação ainda. Crie a primeira vistoria com este checklist.
                </Text>
              </View>
            }
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={GroupSeparator}
            estimatedItemSize={180}
            recycleItems={false}
            showsVerticalScrollIndicator={false}
          />
          <AppBottomSheet
            visible={Boolean(editingGroup)}
            onClose={() => setEditingGroup(null)}
            snapPoints={['95%']}
            footerComponent={footerComponent}
          >
            <BottomSheetView style={styles.batchContent}>
              <Text style={styles.batchHelpText}>
                As tags selecionadas serão aplicadas a todas as aplicações deste grupo.
              </Text>
              <TagMultiSelect
                selectedIds={draftGroupTags}
                availableTags={activeTags}
                allTagsById={tagsById}
                onChange={setDraftGroupTags}
                onCreateTag={createTag}
              />
              {batchError ? <Text style={styles.batchError}>{batchError}</Text> : null}
            </BottomSheetView>
          </AppBottomSheet>
          <ConfirmBottomSheet
            visible={deleteConfirmationVisible}
            title={`Excluir o checklist "${checklist?.title ?? ''}"?`}
            message={`${applications.length} ${applications.length === 1 ? 'aplicação vinculada será excluída' : 'aplicações vinculadas serão excluídas'} junto.`}
            confirmLabel="Excluir checklist"
            confirming={deleting}
            onCancel={() => setDeleteConfirmationVisible(false)}
            onConfirm={confirmDelete}
          />
        </>
      }
    />
  )
}
