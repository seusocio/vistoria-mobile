import { zodResolver } from '@hookform/resolvers/zod'
import { BottomSheetView } from '@gorhom/bottom-sheet'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Pressable, Text, View } from 'react-native'
import {
  AppBottomSheet,
  ConfirmBottomSheet,
  Form,
  useUndoToast,
} from '@/components'
import { useSheetFooterActions } from '@/components/SheetFooterActions'
import { Icon } from '@/components/Icon'
import { ChecklistFormApi, ChecklistFormItemState } from '@/hooks/useChecklistForm'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { ChecklistTemplate } from '@/infra/data/templates'
import {
  ChecklistItemFormValues,
  checklistItemFormSchema,
} from '@/infra/domain/schemas'
import { groupItemsByTitlePrefix } from '@/infra/services'
import { colors } from '@/styles'
import { haptics } from '@/utils/haptics'
import { ChecklistItemGroupSection } from './components/ChecklistItemGroupSection'
import { ResponseOptionsEditor } from './components/ResponseOptionsEditor'
import { TemplatePicker } from './components/TemplatePicker'
import { styles } from './styles'

export interface ChecklistFormViewProps {
  form: ChecklistFormApi
  tagsCatalog: ReturnType<typeof useTagsCatalog>
  templates?: ChecklistTemplate[]
  selectedTemplateId?: string | null
  loadingTemplateId?: string | null
  onSelectTemplate?: (template: ChecklistTemplate) => void
  error?: string | null
}
export function ChecklistFormView({
  form: formApi,
  tagsCatalog,
  templates,
  selectedTemplateId,
  loadingTemplateId,
  onSelectTemplate,
  error,
}: ChecklistFormViewProps) {
  const { form, optionsArray, itemsArray } = formApi
  const { activeTags, tagsById, createTag, resolveLabels } = tagsCatalog
  const { show } = useUndoToast()
  const [itemSheet, setItemSheet] = useState<
    { mode: 'new' } | { mode: 'edit'; index: number } | null
  >(null)
  const [pendingDelete, setPendingDelete] = useState<
    { type: 'item' | 'option'; index: number } | null
  >(null)
  const itemSheetForm = useForm<ChecklistItemFormValues>({
    resolver: zodResolver(checklistItemFormSchema),
    defaultValues: { title: '', description: '', tagsIds: [] },
  })

  const groups = useMemo(
    () => groupItemsByTitlePrefix(itemsArray.fields),
    [itemsArray.fields],
  )
  // A checklist that never used the "Label: " prefix convention (the common
  // case) is a single unlabeled bucket - show it as a flat list, matching
  // the pre-grouping UI exactly, and only reveal headers once rooms/areas
  // are actually in use.
  const showGroupHeaders = !(groups.length === 1 && groups[0]?.label === null)

  function openAddItem() {
    itemSheetForm.reset({ title: '', description: '', tagsIds: [] })
    setItemSheet({ mode: 'new' })
  }

  const openEditItem = useCallback(
    (item: ChecklistFormItemState, index: number) => {
      itemSheetForm.reset({
        id: item.id,
        title: item.title,
        description: item.description,
        tagsIds: item.tagsIds,
      })
      setItemSheet({ mode: 'edit', index })
    },
    [itemSheetForm],
  )

  // Group sections only know each item's field-array `key`; groups are a
  // derived view over the flat `items` array, so every edit/remove/reorder
  // coming from a section resolves back to a flat index before touching it.
  //
  // The lookups read the array through a ref rather than closing over it, so
  // the three callbacks below stay referentially stable for the lifetime of
  // the screen. That's what lets the memoized sections and rows bail out:
  // closing over `itemsArray` would hand every row a new callback on every
  // render and defeat their memo() entirely.
  const itemsArrayRef = useRef(itemsArray)
  itemsArrayRef.current = itemsArray

  const openEditItemByKey = useCallback(
    (key: string) => {
      const { fields } = itemsArrayRef.current
      const index = fields.findIndex((field) => field.key === key)
      const item = fields[index]
      if (index < 0 || !item) return
      openEditItem(item, index)
    },
    [openEditItem],
  )

  const removeItemByKey = useCallback((key: string) => {
    const index = itemsArrayRef.current.fields.findIndex(
      (field) => field.key === key,
    )
    if (index < 0) return
    setPendingDelete({ type: 'item', index })
  }, [])

  const reorderItemsByKey = useCallback((fromKey: string, toKey: string) => {
    const { fields, move } = itemsArrayRef.current
    const fromIndex = fields.findIndex((field) => field.key === fromKey)
    const toIndex = fields.findIndex((field) => field.key === toKey)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
    move(fromIndex, toIndex)
  }, [])

  function removeOptionWithUndo(index: number) {
    const removedOption = form.getValues(`options.${index}`)
    optionsArray.remove(index)
    show({
      message: 'Opção removida',
      onCommit: () => {},
      onUndo: () => optionsArray.insert(index, removedOption),
    })
  }

  function removeItemWithUndo(index: number) {
    const removedItem = form.getValues(`items.${index}`)
    itemsArray.remove(index)
    show({
      message: 'Item removido',
      onCommit: () => {},
      onUndo: () => itemsArray.insert(index, removedItem),
    })
  }

  const handleRemoveOption = useCallback(
    (index: number) => setPendingDelete({ type: 'option', index }),
    [],
  )

  function handleSaveItem(values: ChecklistItemFormValues) {
    if (itemSheet?.mode === 'edit') {
      itemsArray.update(itemSheet.index, values)
    } else {
      itemsArray.append(values)
    }
    setItemSheet(null)
  }
  const footerComponent = useSheetFooterActions({
    confirmLabel: itemSheet?.mode === 'edit' ? 'Salvar' : 'Adicionar',
    onConfirm: itemSheetForm.handleSubmit(handleSaveItem, () =>
      haptics.error(),
    ),
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
        <ResponseOptionsEditor
          control={form.control}
          onRemoveOption={handleRemoveOption}
        />
        <Pressable
          style={({ pressed }) => [
            styles.addOptionButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => optionsArray.append({ label: '', semantic: 'neutro' })}
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
                  onEdit={openEditItemByKey}
                  onRemove={removeItemByKey}
                  onReorder={reorderItemsByKey}
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
          onPress={openAddItem}
        >
          <Icon name="plus" size={14} color={colors.ink.base} />
          <Text style={styles.addItemButtonText}>Adicionar item</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppBottomSheet
        visible={Boolean(itemSheet)}
        onClose={() => setItemSheet(null)}
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
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete?.type === 'option') {
            removeOptionWithUndo(pendingDelete.index)
          } else if (pendingDelete?.type === 'item') {
            removeItemWithUndo(pendingDelete.index)
          }
          setPendingDelete(null)
        }}
      />
    </View>
  )
}
