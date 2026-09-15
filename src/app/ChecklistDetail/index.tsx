import {
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetView,
} from '@gorhom/bottom-sheet'
import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  AppBottomSheet,
  ApplicationRow,
  ApplicationRowEntry,
  ConfirmBottomSheet,
  Metric,
  Screen,
  TagChip,
  TagMultiSelect,
} from '@/components'
import { Icon } from '@/components/Icon'
import { useChecklistDetail } from '@/hooks/useChecklistDetail'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import {
  countNegativeAnswers,
  duplicateChecklist,
  groupApplicationsByTagSet,
  repeatApplicationWithTags,
  softDeleteChecklist,
  updateApplicationTags,
} from '@/infra/services'
import { StackRoutesProps } from '@/routes/types'
import { colors } from '@/styles'
import { formatBrDateShort } from '@/utils/date'
import { styles } from './styles'

export function ChecklistDetail({
  navigation,
  route,
}: StackRoutesProps<'checklistDetail'>) {
  const { checklistId } = route.params
  const { checklist, applications, loading } = useChecklistDetail(checklistId)
  const { resolveLabels, activeTags, tagsById, createTag } = useTagsCatalog()

  const groups = useMemo(
    () => groupApplicationsByTagSet(applications),
    [applications],
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
    (a) => a.status === 'completed',
  ).length

  async function handleDuplicate() {
    const copy = await duplicateChecklist(checklistId)
    navigation.replace('checklistDetail', { checklistId: copy.id })
  }

  function handleDelete() {
    setDeleteConfirmationVisible(true)
  }

  async function confirmDelete() {
    if (deleting) return
    setDeleting(true)
    try {
      await softDeleteChecklist(checklistId)
      setDeleteConfirmationVisible(false)
      navigation.navigate('tabs', { screen: 'home' })
    } finally {
      setDeleting(false)
    }
  }

  function handleOpenBatchEdit(group: (typeof groups)[number]) {
    setEditingGroup(group)
    setDraftGroupTags(group.tagsIds)
    setBatchError(null)
  }

  async function handleSaveBatchEdit() {
    if (!editingGroup) return
    if (draftGroupTags.length === 0) {
      setBatchError('Selecione ao menos uma tag')
      return
    }
    setSavingBatch(true)
    setBatchError(null)
    try {
      for (const application of editingGroup.applications) {
        await updateApplicationTags(application, draftGroupTags)
      }
      setEditingGroup(null)
    } finally {
      setSavingBatch(false)
    }
  }
  function renderBatchFooter(props: BottomSheetFooterProps) {
    return (
      <BottomSheetFooter {...props} style={styles.batchFooter}>
        <Pressable
          style={({ pressed }) => [
            styles.saveTagsButton,
            pressed && { opacity: 0.7 },
            savingBatch && { opacity: 0.55 },
          ]}
          onPress={handleSaveBatchEdit}
          disabled={savingBatch}
        >
          <Text style={styles.saveTagsButtonText}>
            {savingBatch ? 'Salvando...' : 'Aplicar às aplicações'}
          </Text>
        </Pressable>
      </BottomSheetFooter>
    )
  }

  async function handleRepeat(groupApplications: typeof applications) {
    if (!checklist) return
    const newApplication = await repeatApplicationWithTags(
      groupApplications[0],
      checklist,
    )
    navigation.navigate('applicationFill', {
      checklistId,
      applicationId: newApplication.id,
    })
  }

  return (
    <Screen
      loading={loading || !checklist}
      variant="nested"
      onBack={() => navigation.goBack()}
      title="Checklist"
      footer={
        checklist ? (
          <Pressable
            style={({ pressed }) => [
              styles.newAppButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() =>
              navigation.navigate('applicationNew', { checklistId })
            }
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
              style={({ pressed }) => [
                styles.headerActionButton,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() =>
                navigation.navigate('checklistEdit', { checklistId })
              }
              accessibilityLabel="Editar checklist"
            >
              <Icon name="edit-pen" size={16} color={colors.ink.base} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.headerActionButton,
                pressed && { opacity: 0.7 },
              ]}
              onPress={handleDuplicate}
              accessibilityLabel="Duplicar checklist"
            >
              <Icon name="copy" size={16} color={colors.ink.base} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.headerActionButton,
                pressed && { opacity: 0.7 },
              ]}
              onPress={handleDelete}
              accessibilityLabel="Excluir checklist"
            >
              <Icon name="trash-2" size={16} color={colors.danger.base} />
            </Pressable>
          </View>
        ) : undefined
      }
    >
      {checklist && (
        <>
          <View style={styles.titleCol}>
            <Text style={styles.title}>{checklist.title}</Text>
            <View style={styles.tagsRow}>
              {resolveLabels(checklist.tagsIds).map((label) => (
                <TagChip key={label} label={label} tone="neutral" />
              ))}
            </View>
          </View>

          <View style={styles.metricsRow}>
            <Metric label="Aplicações" value={String(applications.length)} />
            <Metric label="Concluídas" value={String(completedCount)} />
            <Metric
              label="Itens/visita"
              value={String(checklist.items.length)}
            />
          </View>

          <Text style={styles.sectionTitle}>Histórico</Text>

          {groups.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                Nenhuma aplicação ainda. Crie a primeira vistoria com este
                checklist.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {groups.map((group) => {
                const entries: ApplicationRowEntry[] = group.applications.map(
                  (application) => ({
                    id: application.id,
                    dateLabel: formatBrDateShort(application.date),
                    negativeCount: countNegativeAnswers(application, checklist),
                  }),
                )
                const latestStatus = group.applications[0].status

                return (
                  <ApplicationRow
                    key={group.key}
                    tagLabels={resolveLabels(group.tagsIds)}
                    latestStatusLabel={
                      latestStatus === 'completed' ? 'Concluída' : 'Rascunho'
                    }
                    latestStatusTone={
                      latestStatus === 'completed' ? 'completed' : 'draft'
                    }
                    entries={entries}
                    defaultExpanded={group === groups[0]}
                    onOpenEntry={(applicationId) =>
                      navigation.navigate('applicationFill', {
                        checklistId,
                        applicationId,
                      })
                    }
                    onRepeat={() => handleRepeat(group.applications)}
                    onEditTags={() => handleOpenBatchEdit(group)}
                  />
                )
              })}
            </View>
          )}
        </>
      )}
      <AppBottomSheet
        visible={Boolean(editingGroup)}
        onClose={() => setEditingGroup(null)}
        snapPoints={['95%']}
        footerComponent={renderBatchFooter}
      >
        <BottomSheetView style={styles.batchContent}>
          <Text style={styles.batchHelpText}>
            As tags selecionadas serão aplicadas a todas as aplicações deste
            grupo.
          </Text>
          <TagMultiSelect
            selectedIds={draftGroupTags}
            availableTags={activeTags}
            allTagsById={tagsById}
            onChange={setDraftGroupTags}
            onCreateTag={createTag}
          />
          {batchError ? (
            <Text style={styles.batchError}>{batchError}</Text>
          ) : null}
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
    </Screen>
  )
}
