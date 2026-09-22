import { BottomSheetView } from '@gorhom/bottom-sheet'
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native'
import { useCallback } from 'react'
import { Pressable, Text, View } from 'react-native'
import { AppBottomSheet, ConfirmBottomSheet, Form, Screen } from '@/components'
import { Icon } from '@/components/Icon'
import { useSheetFooterActions } from '@/components/SheetFooterActions'
import { colors } from '@/styles'
import {
  useChecklistDetailContainer,
  type UseChecklistDetailContainerProps,
} from './checklist-detail.container'
import { styles } from './checklist-detail.styles'
import { ApplicationGroupRow } from './components/ApplicationGroupRow'
import { ChecklistDetailHeader } from './components/ChecklistDetailHeader'

const GroupSeparator = () => <View style={styles.listSeparator} />

export function ChecklistDetailView(props: UseChecklistDetailContainerProps) {
  const c = useChecklistDetailContainer(props)

  const renderGroup = useCallback(
    ({ item, index }: LegendListRenderItemProps<(typeof c.groups)[number]>) => (
      <ApplicationGroupRow
        group={item}
        tagLabels={c.resolveLabels(item.tagsIds)}
        defaultExpanded={index === 0}
        onOpenEntry={c.onOpenEntry}
        onRepeat={c.onRepeat}
        onEditTags={c.onEditTags}
      />
    ),
    [c.onEditTags, c.onOpenEntry, c.onRepeat, c.resolveLabels],
  )

  const footerComponent = useSheetFooterActions({
    confirmLabel: c.isSubmitting ? 'Salvando...' : 'Aplicar às aplicações',
    onConfirm: c.onSaveBatchTags,
    confirming: c.isSubmitting,
  })

  return (
    <Screen
      loading={c.loading}
      variant="nested"
      onBack={c.onBack}
      title="Checklist"
      footer={
        c.checklist ? (
          <Pressable
            style={({ pressed }) => [styles.newAppButton, pressed && { opacity: 0.7 }]}
            onPress={c.onNewApplication}
          >
            <Icon name="plus" size={18} color={colors.white} />
            <Text style={styles.newAppButtonText}>Nova aplicação</Text>
          </Pressable>
        ) : undefined
      }
      headerRight={
        c.checklist ? (
          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [styles.headerActionButton, pressed && { opacity: 0.7 }]}
              onPress={c.onEditChecklist}
              accessibilityLabel="Editar checklist"
            >
              <Icon name="edit-pen" size={16} color={colors.ink.base} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.headerActionButton, pressed && { opacity: 0.7 }]}
              onPress={c.onDuplicate}
              accessibilityLabel="Duplicar checklist"
            >
              <Icon name="copy" size={16} color={colors.ink.base} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.headerActionButton, pressed && { opacity: 0.7 }]}
              onPress={c.onAskDelete}
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
            data={c.groups}
            renderItem={renderGroup}
            keyExtractor={(item) => item.key}
            ListHeaderComponent={
              c.checklist ? (
                <ChecklistDetailHeader
                  checklist={c.checklist}
                  tagLabels={c.resolveLabels(c.checklist.tagsIds)}
                  applicationsCount={c.applicationsCount}
                  completedCount={c.completedCount}
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
            visible={Boolean(c.editingGroup)}
            onClose={c.onCloseBatchEdit}
            snapPoints={['95%']}
            footerComponent={footerComponent}
          >
            <BottomSheetView style={styles.batchContent}>
              <Text style={styles.batchHelpText}>
                As tags selecionadas serão aplicadas a todas as aplicações deste grupo.
              </Text>
              <Form.TagSelect
                control={c.control}
                name="tagsIds"
                availableTags={c.activeTags}
                allTagsById={c.tagsById}
                onCreateTag={c.createTag}
              />
              <Form.ErrorText message={c.errorMessage} />
            </BottomSheetView>
          </AppBottomSheet>
          <ConfirmBottomSheet
            visible={c.deleteConfirmationVisible}
            title={`Excluir o checklist "${c.checklist?.title ?? ''}"?`}
            message={`${c.applicationsCount} ${c.applicationsCount === 1 ? 'aplicação vinculada será excluída' : 'aplicações vinculadas serão excluídas'} junto.`}
            confirmLabel="Excluir checklist"
            confirming={c.deleting}
            onCancel={c.onCancelDelete}
            onConfirm={c.onConfirmDelete}
          />
        </>
      }
    />
  )
}
