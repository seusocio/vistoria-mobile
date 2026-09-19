import { BottomSheetView } from '@gorhom/bottom-sheet'
import { useMemo } from 'react'
import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form'
import { Pressable, Text, View } from 'react-native'
import { AppBottomSheet, ConfirmBottomSheet, Form } from '@/components'
import { Icon } from '@/components/Icon'
import { useSheetFooterActions } from '@/components/SheetFooterActions'
import type { useTagsCatalog } from '@/hooks/useTagsCatalog'
import type { ChecklistTemplate } from '@/infra/data/templates'
import { groupItemsByTitlePrefix } from '@/infra/services'
import { colors } from '@/styles'
import { haptics } from '@/utils/haptics'
import { styles } from './checklist-form.styles'
import type { ChecklistFormValues, ChecklistItemFormValues } from './checklist-form.schema'
import { ChecklistItemGroupSection } from './components/ChecklistItemGroupSection'
import { ResponseOptionsEditor } from './components/ResponseOptionsEditor'
import { TemplatePicker } from './components/TemplatePicker'

export type ItemSheetState = { mode: 'new' } | { mode: 'edit'; index: number } | null
export type PendingDeleteState = { type: 'item' | 'option'; index: number } | null

export interface ChecklistFormViewProps {
  form: UseFormReturn<ChecklistFormValues>
  itemsArray: UseFieldArrayReturn<ChecklistFormValues, 'items', 'key'>
  tagsCatalog: ReturnType<typeof useTagsCatalog>
  templates?: ChecklistTemplate[]
  selectedTemplateId?: string | null
  loadingTemplateId?: string | null
  onSelectTemplate?: (template: ChecklistTemplate) => void
  error?: string | null

  onAddOption: () => void
  onRemoveOption: (index: number) => void

  onAddItem: () => void
  onEditItemByKey: (key: string) => void
  onRemoveItemByKey: (key: string) => void
  onReorderItemsByKey: (fromKey: string, toKey: string) => void

  itemSheet: ItemSheetState
  itemSheetForm: UseFormReturn<ChecklistItemFormValues>
  onCloseItemSheet: () => void
  onSaveItem: (values: ChecklistItemFormValues) => void

  pendingDelete: PendingDeleteState
  onCancelPendingDelete: () => void
  onConfirmPendingDelete: () => void
}

/**
 * Pure view: every piece of state (the two forms, the item sheet, the
 * pending-delete confirmation) is owned by the container and handed down as
 * props. The only things computed here are `groups`/`showGroupHeaders` —
 * presentational derivations of `itemsArray.fields` for rendering, not state.
 */
export function ChecklistFormView({
  form,
  itemsArray,
  tagsCatalog,
  templates,
  selectedTemplateId,
  loadingTemplateId,
  onSelectTemplate,
  error,
  onAddOption,
  onRemoveOption,
  onAddItem,
  onEditItemByKey,
  onRemoveItemByKey,
  onReorderItemsByKey,
  itemSheet,
  itemSheetForm,
  onCloseItemSheet,
  onSaveItem,
  pendingDelete,
  onCancelPendingDelete,
  onConfirmPendingDelete,
}: ChecklistFormViewProps) {
  const { activeTags, tagsById, createTag, resolveLabels } = tagsCatalog

  const groups = useMemo(
    () => groupItemsByTitlePrefix(itemsArray.fields),
    [itemsArray.fields],
  )
  // A checklist that never used the "Label: " prefix convention (the common
  // case) is a single unlabeled bucket - show it as a flat list, matching
  // the pre-grouping UI exactly, and only reveal headers once rooms/areas
  // are actually in use.
  const showGroupHeaders = !(groups.length === 1 && groups[0]?.label === null)

  const footerComponent = useSheetFooterActions({
    confirmLabel: itemSheet?.mode === 'edit' ? 'Salvar' : 'Adicionar',
    onConfirm: itemSheetForm.handleSubmit(onSaveItem, () => haptics.error()),
  })

  return (
    <View style={styles.container}>
      {templates && templates.length > 0 ? (
        <TemplatePicker
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          loadingTemplateId={loadingTemplateId}
          onSelect={onSelectTemplate}
        />
      ) : null}

      <View style={styles.section}>
        <Text style={styles.fieldLabel}>Nome do checklist</Text>
        <Form.TextField
          control={form.control}
          name="title"
          placeholder="Ex.: Vistoria de entrega"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.fieldLabel}>Tags do checklist</Text>
        <Form.TagSelect
          control={form.control}
          name="tagsIds"
          availableTags={activeTags}
          allTagsById={tagsById}
          onCreateTag={createTag}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.fieldLabel}>Opções de resposta</Text>
        <ResponseOptionsEditor control={form.control} onRemoveOption={onRemoveOption} />
        <Pressable
          style={({ pressed }) => [
            styles.addOptionButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onAddOption}
        >
          <Icon name="plus" size={12} color={colors.blue.base} />
          <Text style={styles.addOptionText}>Adicionar opção (ex: Não aplica)</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <View style={styles.itemsHeader}>
          <Text style={styles.fieldLabel}>Itens do checklist</Text>
          <Text style={styles.itemsCount}>{itemsArray.fields.length} itens</Text>
        </View>
        {itemsArray.fields.length > 0 && (
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
                  onEdit={onEditItemByKey}
                  onRemove={onRemoveItemByKey}
                  onReorder={onReorderItemsByKey}
                />
              )
            })}
          </View>
        )}
        <Pressable
          style={({ pressed }) => [
            styles.addItemButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onAddItem}
        >
          <Icon name="plus" size={14} color={colors.ink.base} />
          <Text style={styles.addItemButtonText}>Adicionar item</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppBottomSheet
        visible={Boolean(itemSheet)}
        onClose={onCloseItemSheet}
        snapPoints={['90%']}
        footerComponent={footerComponent}
      >
        <BottomSheetView style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>
            {itemSheet?.mode === 'edit' ? 'Editar item' : 'Novo item'}
          </Text>
          <View style={styles.sheetField}>
            <Text style={styles.fieldLabel}>Título do item</Text>
            <Form.SheetTextField
              control={itemSheetForm.control}
              name="title"
              autoFocus
              placeholder="Ex.: Pintura das paredes"
              placeholderTextColor={colors.gray[400]}
              style={styles.sheetInput}
            />
            <Form.ErrorText
              message={itemSheetForm.formState.errors.title?.message}
            />
          </View>
          <View style={styles.sheetField}>
            <Text style={styles.fieldLabel}>Descrição (opcional)</Text>
            <Form.SheetTextField
              control={itemSheetForm.control}
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
              control={itemSheetForm.control}
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
        visible={pendingDelete !== null}
        title={pendingDelete?.type === 'option' ? 'Remover opção' : 'Remover item'}
        message={
          pendingDelete?.type === 'option'
            ? 'Deseja remover esta opção de resposta?'
            : 'Deseja remover este item do checklist?'
        }
        confirmLabel={pendingDelete?.type === 'option' ? 'Remover opção' : 'Remover item'}
        warning="Você poderá desfazer isso por alguns segundos depois de confirmar."
        onCancel={onCancelPendingDelete}
        onConfirm={onConfirmPendingDelete}
      />
    </View>
  )
}
