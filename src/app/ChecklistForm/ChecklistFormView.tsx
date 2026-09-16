import { BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet'
import { memo, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Gesture } from 'react-native-gesture-handler'
import {
  NestedReorderableList,
  reorderItems,
  useReorderableDrag,
} from 'react-native-reorderable-list'
import {
  AppBottomSheet,
  Input,
  TagChipList,
  TagMultiSelect,
  useUndoToast,
} from '@/components'
import { useSheetFooterActions } from '@/components/SheetFooterActions'
import { Icon } from '@/components/Icon'
import {
  ChecklistFormApi,
  ChecklistFormItemState,
} from '@/hooks/useChecklistForm'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { ChecklistTemplate } from '@/infra/data/templates'
import { colors } from '@/styles'
import { haptics } from '@/utils/haptics'
import { ResponseOptionsEditor } from './components/ResponseOptionsEditor'
import { TemplatePicker } from './components/TemplatePicker'
import { styles } from './styles'

const ReorderableChecklistItem = memo(function ReorderableChecklistItem({
  item,
  index,
  labels,
  onEdit,
  onRemove,
}: {
  item: ChecklistFormItemState
  index: number
  labels: string[]
  onEdit: () => void
  onRemove: () => void
}) {
  const drag = useReorderableDrag()
  return (
    <View style={styles.itemCard}>
      <Pressable
        style={({ pressed }) => [
          styles.itemCardTouchable,
          pressed && { opacity: 0.7 },
        ]}
        onPress={onEdit}
        onLongPress={() => {
          haptics.dragStart()
          drag()
        }}
        delayLongPress={520}
        accessibilityLabel={`Editar item ${index + 1}`}
      >
        <Icon name="grip-vertical" size={18} color={colors.gray[200]} />
        <View style={styles.itemNum}>
          <Text style={styles.itemNumText}>{index + 1}</Text>
        </View>
        <View style={styles.itemCardBody}>
          <Text
            style={[
              styles.itemCardTitle,
              !item.title && styles.itemCardPlaceholder,
            ]}
            numberOfLines={1}
          >
            {item.title || 'Item sem título'}
          </Text>
          {item.description ? (
            <Text style={styles.itemCardDescription} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
          {labels.length > 0 && (
            <TagChipList labels={labels} tone="neutral" />
          )}
        </View>
      </Pressable>
      <Pressable
        style={({ pressed }) => pressed && { opacity: 0.7 }}
        hitSlop={14}
        onPress={onRemove}
        accessibilityLabel={`Remover item ${index + 1}`}
      >
        <Icon name="trash-2" size={16} color={colors.gray[400]} />
      </Pressable>
    </View>
  )
})


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
  form,
  tagsCatalog,
  templates,
  selectedTemplateId,
  loadingTemplateId,
  onSelectTemplate,
  error,
}: ChecklistFormViewProps) {
  const { activeTags, tagsById, createTag, resolveLabels } = tagsCatalog
  // Must stay comfortably longer than the item Pressable's delayLongPress (520ms)
  // so the JS long-press timer always wins the race and calls drag() first —
  // otherwise this native pan gesture can activate first and cancel the touch
  // before the Pressable's onLongPress ever fires.
  const panGesture = useMemo(
    () => Gesture.Pan().activateAfterLongPress(700),
    [],
  )
  const { show } = useUndoToast()
  const [itemSheet, setItemSheet] = useState<
    { mode: 'new' } | { mode: 'edit'; key: string } | null
  >(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftTagsIds, setDraftTagsIds] = useState<string[]>([])
  const [itemError, setItemError] = useState<string | null>(null)

  function openAddItem() {
    setDraftTitle('')
    setDraftDescription('')
    setDraftTagsIds([])
    setItemError(null)
    setItemSheet({ mode: 'new' })
  }

  function openEditItem(item: ChecklistFormItemState) {
    setDraftTitle(item.title)
    setDraftDescription(item.description)
    setDraftTagsIds(item.tagsIds)
    setItemError(null)
    setItemSheet({ mode: 'edit', key: item.key })
  }
  function removeOptionWithUndo(index: number) {
    const snapshot = form.options
    form.removeOption(index)
    show({
      message: 'Opção removida',
      onCommit: () => {},
      onUndo: () => form.setOptions(snapshot),
    })
  }

  function removeItemWithUndo(key: string) {
    const snapshot = form.items
    form.removeItem(key)
    show({
      message: 'Item removido',
      onCommit: () => {},
      onUndo: () => form.setItems(snapshot),
    })
  }


  function handleSaveItem() {
    if (!draftTitle.trim()) {
      haptics.error()
      setItemError('Informe um título para o item')
      return
    }
    const values = {
      title: draftTitle.trim(),
      description: draftDescription.trim(),
      tagsIds: draftTagsIds,
    }
    if (itemSheet?.mode === 'edit') {
      form.updateItem(itemSheet.key, values)
    } else {
      form.addItem(values)
    }
    setItemSheet(null)
  }
  const footerComponent = useSheetFooterActions({
    confirmLabel: itemSheet?.mode === 'edit' ? 'Salvar' : 'Adicionar',
    onConfirm: handleSaveItem,
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
        <Input
          placeholder="Ex.: Vistoria de entrega"
          value={form.title}
          onChangeValue={(value) => form.setTitle(String(value))}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.fieldLabel}>Tags do checklist</Text>
        <TagMultiSelect
          selectedIds={form.tagsIds}
          availableTags={activeTags}
          allTagsById={tagsById}
          onChange={form.setTagsIds}
          onCreateTag={createTag}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.fieldLabel}>Opções de resposta</Text>
        <ResponseOptionsEditor
          form={form}
          onRemoveOption={removeOptionWithUndo}
        />
        <Pressable
          style={({ pressed }) => [
            styles.addOptionButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={form.addOption}
        >
          <Icon name="plus" size={12} color={colors.blue.base} />
          <Text style={styles.addOptionText}>Adicionar opção (ex: Não aplica)</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <View style={styles.itemsHeader}>
          <Text style={styles.fieldLabel}>Itens do checklist</Text>
          <Text style={styles.itemsCount}>{form.items.length} itens</Text>
        </View>
        {form.items.length > 0 && (
          <NestedReorderableList
            data={form.items}
            scrollable={false}
            scrollEnabled={false}
            contentContainerStyle={styles.itemsList}
            panGesture={panGesture}
            keyExtractor={(item) => item.key}
            onReorder={({ from, to }) =>
              form.setItems(reorderItems(form.items, from, to))
            }
            renderItem={({ item, index }) => (
              <ReorderableChecklistItem
                item={item}
                index={index}
                labels={resolveLabels(item.tagsIds)}
                onEdit={() => openEditItem(item)}
                onRemove={() => removeItemWithUndo(item.key)}
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
            <BottomSheetTextInput
              autoFocus
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="Ex.: Pintura das paredes"
              placeholderTextColor={colors.gray[400]}
              style={styles.sheetInput}
            />
          </View>
          <View style={styles.sheetField}>
            <Text style={styles.fieldLabel}>Descrição (opcional)</Text>
            <BottomSheetTextInput
              value={draftDescription}
              onChangeText={setDraftDescription}
              placeholder="Detalhe o que deve ser verificado"
              placeholderTextColor={colors.gray[400]}
              style={[styles.sheetInput, styles.sheetTextarea]}
              multiline
            />
          </View>
          <View style={styles.sheetField}>
            <Text style={styles.fieldLabel}>Tags do item</Text>
            <TagMultiSelect
              selectedIds={draftTagsIds}
              availableTags={activeTags}
              allTagsById={tagsById}
              onChange={setDraftTagsIds}
              onCreateTag={createTag}
              placeholder="Responsável padrão (opcional)"
              variant="muted"
            />
          </View>
          {itemError ? <Text style={styles.error}>{itemError}</Text> : null}
        </BottomSheetView>
      </AppBottomSheet>
    </View>
  )
}
