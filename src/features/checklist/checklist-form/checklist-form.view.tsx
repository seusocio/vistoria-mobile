import { BottomSheetView } from '@gorhom/bottom-sheet'
import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ScrollViewContainer } from 'react-native-reorderable-list'
import {
  AppBottomSheet,
  ConfirmBottomSheet,
  FloatingAction,
  Form,
  Screen,
} from '@/components'
import { Icon } from '@/components/Icon'
import { useSheetFooterActions } from '@/components/SheetFooterActions'
import { groupItemsByTitlePrefix } from '@/features/application/shared/application.utils'
import { colors } from '@/styles'
import { haptics } from '@/utils/haptics'
import { styles } from './checklist-form.styles'
import {
  useChecklistFormContainer,
  type UseChecklistFormContainerProps,
} from './checklist-form.container'
import { ChecklistItemGroupSection } from './components/ChecklistItemGroupSection'
import { ResponseOptionsEditor } from './components/ResponseOptionsEditor'
import { TemplatePicker } from './components/TemplatePicker'

/**
 * The only component in this feature — it calls useChecklistFormContainer
 * directly and renders from its return value. No separate container
 * component, no props interface mirroring the hook's internals by hand.
 */
export function ChecklistFormView(props: UseChecklistFormContainerProps) {
  const container = useChecklistFormContainer(props)
  const { activeTags, tagsById, createTag, resolveLabels } = container.tagsCatalog

  const groups = useMemo(
    () => groupItemsByTitlePrefix(container.itemsArray.fields),
    [container.itemsArray.fields],
  )
  // A checklist that never used the "Label: " prefix convention (the common
  // case) is a single unlabeled bucket - show it as a flat list, matching
  // the pre-grouping UI exactly, and only reveal headers once rooms/areas
  // are actually in use.
  const showGroupHeaders = !(groups.length === 1 && groups[0]?.label === null)

  const footerComponent = useSheetFooterActions({
    confirmLabel: container.itemSheet?.mode === 'edit' ? 'Salvar' : 'Adicionar',
    onConfirm: container.itemSheetForm.handleSubmit(container.onSaveItem, () => haptics.error()),
  })

  if (container.loading) {
    return (
      <Screen
        loading
        variant="nested"
        navTitleTone="strong"
        onBack={container.onBack}
        title="Editar checklist"
      />
    )
  }

  return (
    <Screen
      ScrollComponent={ScrollViewContainer}
      variant="nested"
      navTitleTone="strong"
      onBack={container.onBack}
      title={container.isEditing ? 'Editar checklist' : 'Novo checklist'}
      footer={
        container.isEditing ? undefined : (
          <FloatingAction
            label="Criar checklist"
            icon="check"
            onPress={container.onCreate}
            disabled={container.form.formState.isSubmitting}
          />
        )
      }
    >
      <View style={styles.container}>
        {container.templates && container.templates.length > 0 ? (
          <TemplatePicker
            templates={container.templates}
            selectedTemplateId={container.selectedTemplateId}
            loadingTemplateId={container.loadingTemplateId}
            onSelect={container.onSelectTemplate}
          />
        ) : null}

        <View style={styles.section}>
          <Text style={styles.fieldLabel}>Nome do checklist</Text>
          <Form.TextField
            control={container.form.control}
            name="title"
            placeholder="Ex.: Vistoria de entrega"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.fieldLabel}>Tags do checklist</Text>
          <Form.TagSelect
            control={container.form.control}
            name="tagsIds"
            availableTags={activeTags}
            allTagsById={tagsById}
            onCreateTag={createTag}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.fieldLabel}>Opções de resposta</Text>
          <ResponseOptionsEditor control={container.form.control} onRemoveOption={container.onRemoveOption} />
          <Pressable
            style={({ pressed }) => [styles.addOptionButton, pressed && { opacity: 0.7 }]}
            onPress={container.onAddOption}
          >
            <Icon name="plus" size={12} color={colors.blue.base} />
            <Text style={styles.addOptionText}>Adicionar opção (ex: Não aplica)</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.itemsHeader}>
            <Text style={styles.fieldLabel}>Itens do checklist</Text>
            <Text style={styles.itemsCount}>{container.itemsArray.fields.length} itens</Text>
          </View>
          {container.itemsArray.fields.length > 0 && (
            <View style={styles.groupsList}>
              {groups.map((group) => {
                const groupKey = group.label ?? 'ungrouped'
                return (
                  <ChecklistItemGroupSection
                    key={groupKey}
                    title={group.label ?? 'Outros itens'}
                    items={group.children}
                    showHeader={showGroupHeaders}
                    resolveLabels={resolveLabels}
                    onEdit={container.onEditItemByKey}
                    onRemove={container.onRemoveItemByKey}
                    onReorder={container.onReorderItemsByKey}
                  />
                )
              })}
            </View>
          )}
          <Pressable
            style={({ pressed }) => [styles.addItemButton, pressed && { opacity: 0.7 }]}
            onPress={container.onAddItem}
          >
            <Icon name="plus" size={14} color={colors.ink.base} />
            <Text style={styles.addItemButtonText}>Adicionar item</Text>
          </Pressable>
        </View>

        {container.templateError ? <Text style={styles.error}>{container.templateError}</Text> : null}
        <AppBottomSheet
          visible={Boolean(container.itemSheet)}
          onClose={container.onCloseItemSheet}
          snapPoints={['90%']}
          footerComponent={footerComponent}
        >
          <BottomSheetView style={styles.sheetContent}>
            <Text style={styles.sheetTitle}>
              {container.itemSheet?.mode === 'edit' ? 'Editar item' : 'Novo item'}
            </Text>
            <View style={styles.sheetField}>
              <Text style={styles.fieldLabel}>Título do item</Text>
              <Form.SheetTextField
                control={container.itemSheetForm.control}
                name="title"
                autoFocus
                placeholder="Ex.: Pintura das paredes"
                placeholderTextColor={colors.gray[400]}
                style={styles.sheetInput}
              />
              <Form.ErrorText
                message={container.itemSheetForm.formState.errors.title?.message}
              />
            </View>
            <View style={styles.sheetField}>
              <Text style={styles.fieldLabel}>Descrição (opcional)</Text>
              <Form.SheetTextField
                control={container.itemSheetForm.control}
                name="description"
                placeholder="Detalhe o que deve ser verificado"
                placeholderTextColor={colors.gray[400]}
                style={[styles.sheetInput, styles.sheetTextarea]}
                multiline
              />
            </View>
            <View style={styles.sheetField}>
              <Text style={styles.fieldLabel}>Tags do item</Text>
              <Form.TagSelect
                control={container.itemSheetForm.control}
                name="tagsIds"
                availableTags={activeTags}
                allTagsById={tagsById}
                onCreateTag={createTag}
                placeholder="Responsável padrão (opcional)"
                variant="muted"
              />
            </View>
          </BottomSheetView>
        </AppBottomSheet>
        <ConfirmBottomSheet
          visible={container.pendingDelete !== null}
          title={container.pendingDelete?.type === 'option' ? 'Remover opção' : 'Remover item'}
          message={
            container.pendingDelete?.type === 'option'
              ? 'Deseja remover esta opção de resposta?'
              : 'Deseja remover este item do checklist?'
          }
          confirmLabel={container.pendingDelete?.type === 'option' ? 'Remover opção' : 'Remover item'}
          warning="Você poderá desfazer isso por alguns segundos depois de confirmar."
          onCancel={container.onCancelPendingDelete}
          onConfirm={container.onConfirmPendingDelete}
        />
      </View>
    </Screen>
  )
}
