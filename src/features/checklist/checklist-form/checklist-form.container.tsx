import { zodResolver } from '@hookform/resolvers/zod'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useCallback, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { Pressable, Text } from 'react-native'
import { ScrollViewContainer } from 'react-native-reorderable-list'
import { Screen, useUndoToast } from '@/components'
import { Icon } from '@/components/Icon'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import type { Checklist } from '@/infra/domain/entities'
import { checklistTemplates, type ChecklistTemplate } from '@/infra/data/templates'
import { useEntity, enqueueOp } from '@/lib/offline-queue'
import type { StackRoutesList } from '@/routes/types'
import { colors } from '@/styles'
import { useDraft } from '@/lib/forms'
import { api } from '../../../../convex/_generated/api'
import {
  checklistFormSchema,
  checklistItemFormSchema,
  checklistToFormValues,
  type ChecklistFormItemState,
  type ChecklistFormValues,
  type ChecklistItemFormValues,
} from './checklist-form.schema'
import { checklistSave } from './checklist-form.ops'
import { buildChecklistEntity } from './checklist-form.utils'
import { styles } from './checklist-form.styles'
import { ChecklistFormView, type ItemSheetState, type PendingDeleteState } from './checklist-form.view'

type Navigation = NativeStackNavigationProp<StackRoutesList, keyof StackRoutesList>

export interface ChecklistFormContainerProps {
  /** Omit to create a new checklist; pass to edit an existing one. */
  checklistId?: string
  navigation: Navigation
}

export function ChecklistFormContainer({ checklistId, navigation }: ChecklistFormContainerProps) {
  const isEditing = Boolean(checklistId)
  const existing = useEntity<Checklist>(
    api.checklists.findById,
    { id: checklistId ?? '' },
    checklistId ?? '',
  )

  if (isEditing && (existing === undefined || existing === null)) {
    return (
      <Screen
        loading
        variant="nested"
        navTitleTone="strong"
        onBack={() => navigation.goBack()}
        title="Editar checklist"
      />
    )
  }

  // Mounting fresh only once `existing` (or the absence of an id, for
  // creation) is settled means useDraft's defaultValues are correct from
  // the first render — no separate "reset once loaded" effect needed, and
  // no race between that effect and useDraft's own AsyncStorage rehydration.
  return (
    <ChecklistFormReady
      checklistId={checklistId}
      existing={existing ?? null}
      navigation={navigation}
    />
  )
}

interface ChecklistFormReadyProps {
  checklistId?: string
  existing: Checklist | null
  navigation: Navigation
}

function ChecklistFormReady({ checklistId, existing, navigation }: ChecklistFormReadyProps) {
  const isEditing = Boolean(checklistId)
  const tagsCatalog = useTagsCatalog()
  const { show } = useUndoToast()

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [itemSheet, setItemSheet] = useState<ItemSheetState>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteState>(null)

  const { form, commit, clearDraft } = useDraft<ChecklistFormValues>({
    key: `checklist:${checklistId ?? 'new'}`,
    schema: checklistFormSchema,
    defaultValues: checklistToFormValues(existing),
    autoCommit: isEditing,
    onCommit: (values) => {
      if (!checklistId) return
      enqueueOp(checklistSave, { id: checklistId, entity: buildChecklistEntity(existing, values) })
    },
  })
  const optionsArray = useFieldArray({ control: form.control, name: 'options' })
  const itemsArray = useFieldArray({ control: form.control, name: 'items', keyName: 'key' })

  const itemSheetForm = useForm<ChecklistItemFormValues>({
    resolver: zodResolver(checklistItemFormSchema),
    defaultValues: { title: '', description: '', tagsIds: [] },
  })

  // Sections only know each item's field-array `key`, so every edit/remove/
  // reorder resolves back to a flat index before touching it. The lookups
  // read the array through a ref rather than closing over it, so the
  // callbacks below stay referentially stable for the section's memo() to
  // hold — see ADR 0008.
  const itemsArrayRef = useRef(itemsArray)
  itemsArrayRef.current = itemsArray

  function openAddItem() {
    itemSheetForm.reset({ title: '', description: '', tagsIds: [] })
    setItemSheet({ mode: 'new' })
  }

  const openEditItem = useCallback((item: ChecklistFormItemState, index: number) => {
    itemSheetForm.reset({
      id: item.id,
      title: item.title,
      description: item.description,
      tagsIds: item.tagsIds,
    })
    setItemSheet({ mode: 'edit', index })
  }, [itemSheetForm.reset])

  const onEditItemByKey = useCallback(
    (key: string) => {
      const { fields } = itemsArrayRef.current
      const index = fields.findIndex((field) => field.key === key)
      const item = fields[index]
      if (index < 0 || !item) return
      openEditItem(item, index)
    },
    [openEditItem],
  )

  const onRemoveItemByKey = useCallback((key: string) => {
    const index = itemsArrayRef.current.fields.findIndex((field) => field.key === key)
    if (index < 0) return
    setPendingDelete({ type: 'item', index })
  }, [])

  const onReorderItemsByKey = useCallback((fromKey: string, toKey: string) => {
    const { fields, move } = itemsArrayRef.current
    const fromIndex = fields.findIndex((field) => field.key === fromKey)
    const toIndex = fields.findIndex((field) => field.key === toKey)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
    move(fromIndex, toIndex)
  }, [])

  const onRemoveOption = useCallback((index: number) => setPendingDelete({ type: 'option', index }), [])

  function removeOptionWithUndo(index: number) {
    const removedOption = form.getValues(`options.${index}`)
    optionsArray.remove(index)
    show({ message: 'Opção removida', onCommit: () => {}, onUndo: () => optionsArray.insert(index, removedOption) })
  }

  function removeItemWithUndo(index: number) {
    const removedItem = form.getValues(`items.${index}`)
    itemsArray.remove(index)
    show({ message: 'Item removido', onCommit: () => {}, onUndo: () => itemsArray.insert(index, removedItem) })
  }

  function onSaveItem(values: ChecklistItemFormValues) {
    if (itemSheet?.mode === 'edit') itemsArray.update(itemSheet.index, values)
    else itemsArray.append(values)
    setItemSheet(null)
  }

  async function handleSelectTemplate(template: ChecklistTemplate) {
    if (loadingTemplateId) return
    setLoadingTemplateId(template.id)
    setTemplateError(null)
    try {
      const tags = await Promise.all(template.tagLabels.map((label) => tagsCatalog.createTag(label)))
      form.reset({
        title: template.title,
        tagsIds: tags.map((tag) => tag.id),
        options: template.options,
        items: template.itemTitles.map((itemTitle) => ({ title: itemTitle, description: '', tagsIds: [] })),
      })
      setSelectedTemplateId(template.id)
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : 'Não foi possível aplicar o modelo')
    } finally {
      setLoadingTemplateId(null)
    }
  }

  async function handleCreate() {
    const committed = await commit()
    if (!committed) {
      // commit() already fired haptics.error(); surface *why* too — e.g.
      // "adicione ao menos um item" — the same message the pre-refactor
      // flow showed via its try/catch, now read straight from RHF's own
      // validation state instead of a thrown error.
      setTemplateError(
        form.formState.errors.items?.message ?? form.formState.errors.title?.message ?? null,
      )
      return
    }
    setTemplateError(null)
    const entity = buildChecklistEntity(null, form.getValues())
    enqueueOp(checklistSave, { id: entity.id, entity })
    void clearDraft()
    navigation.replace('checklistDetail', { checklistId: entity.id })
  }

  return (
    <Screen
      ScrollComponent={ScrollViewContainer}
      variant="nested"
      navTitleTone="strong"
      onBack={() => navigation.goBack()}
      title={isEditing ? 'Editar checklist' : 'Novo checklist'}
      footer={
        isEditing ? undefined : (
          <Pressable
            style={({ pressed }) => [styles.saveButton, pressed && { opacity: 0.7 }]}
            onPress={handleCreate}
            disabled={form.formState.isSubmitting}
          >
            <Icon name="check" size={18} color={colors.white} />
            <Text style={styles.saveButtonText}>Criar checklist</Text>
          </Pressable>
        )
      }
    >
      <ChecklistFormView
        form={form}
        itemsArray={itemsArray}
        tagsCatalog={tagsCatalog}
        templates={isEditing ? undefined : checklistTemplates}
        selectedTemplateId={selectedTemplateId}
        loadingTemplateId={loadingTemplateId}
        onSelectTemplate={handleSelectTemplate}
        error={templateError}
        onAddOption={() => optionsArray.append({ label: '', semantic: 'neutro' })}
        onRemoveOption={onRemoveOption}
        onAddItem={openAddItem}
        onEditItemByKey={onEditItemByKey}
        onRemoveItemByKey={onRemoveItemByKey}
        onReorderItemsByKey={onReorderItemsByKey}
        itemSheet={itemSheet}
        itemSheetForm={itemSheetForm}
        onCloseItemSheet={() => setItemSheet(null)}
        onSaveItem={onSaveItem}
        pendingDelete={pendingDelete}
        onCancelPendingDelete={() => setPendingDelete(null)}
        onConfirmPendingDelete={() => {
          if (pendingDelete?.type === 'option') removeOptionWithUndo(pendingDelete.index)
          else if (pendingDelete?.type === 'item') removeItemWithUndo(pendingDelete.index)
          setPendingDelete(null)
        }}
      />
    </Screen>
  )
}
