import { zodResolver } from '@hookform/resolvers/zod'
import { BottomSheetView } from '@gorhom/bottom-sheet'
import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Pressable, Text, View } from 'react-native'
import { NestedReorderableList } from 'react-native-reorderable-list'
import {
  AppBottomSheet,
  ConfirmBottomSheet,
  Form,
  useUndoToast,
} from '@/components'
import { useSheetFooterActions } from '@/components/SheetFooterActions'
import { Icon } from '@/components/Icon'
import { ChecklistFormApi, ChecklistFormItemState } from '@/hooks/useChecklistForm'
import { useReorderablePanGesture } from '@/hooks/useReorderablePanGesture'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { ChecklistTemplate } from '@/infra/data/templates'
import {
  ChecklistItemFormValues,
  checklistItemFormSchema,
} from '@/infra/domain/schemas'
import { colors } from '@/styles'
import { haptics } from '@/utils/haptics'
import { ChecklistItemRow } from './components/ChecklistItemRow'
import { ResponseOptionsEditor } from './components/ResponseOptionsEditor'
import { TemplatePicker } from './components/TemplatePicker'
import { styles } from './styles'
import { LinearTransition } from 'react-native-reanimated'

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
  const panGesture = useReorderablePanGesture()
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

  function openAddItem() {
    itemSheetForm.reset({ title: '', description: '', tagsIds: [] })
    setItemSheet({ mode: 'new' })
  }

  function openEditItem(item: ChecklistFormItemState, index: number) {
    itemSheetForm.reset({
      id: item.id,
      title: item.title,
      description: item.description,
      tagsIds: item.tagsIds,
    })
    setItemSheet({ mode: 'edit', index })
  }
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
          <NestedReorderableList
            data={itemsArray.fields}
            scrollable={false}
            scrollEnabled={false}
            contentContainerStyle={styles.itemsList}
            panGesture={panGesture}
            itemLayoutAnimation={LinearTransition.duration(220)}
            keyExtractor={(item) => item.key}
            onReorder={({ from, to }) => itemsArray.move(from, to)}
            renderItem={({ item, index }) => (
              <ChecklistItemRow
                item={item}
                index={index}
                labels={resolveLabels(item.tagsIds)}
                onEdit={() => openEditItem(item, index)}
                onRemove={() => setPendingDelete({ type: 'item', index })}
              />
            )}
          />
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
