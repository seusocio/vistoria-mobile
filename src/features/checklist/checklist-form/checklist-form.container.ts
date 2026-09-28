import { zodResolver } from '@hookform/resolvers/zod'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useUndoToast } from '@/components'
import { useTagsCatalog } from '@/features/tag/shared/use-tags-catalog'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import { checklistTemplates, type ChecklistTemplate } from '@/features/checklist/shared/checklist.templates'
import { useChecklistRestResult } from '@/features/checklist/shared/checklist.rest'
import { useDraft } from '@/lib/forms'
import { enqueueOp, useEntity } from '@/lib/offline-queue'
import type { StackRoutesList } from '@/routes/types'
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
import { useCreateChecklist } from '@/lib/api/endpoints'

export type ItemSheetState = { mode: 'new' } | { mode: 'edit'; index: number } | null
export type PendingDeleteState = { type: 'item' | 'option'; index: number } | null

type Navigation = NativeStackNavigationProp<StackRoutesList, keyof StackRoutesList>

export interface UseChecklistFormContainerProps {
  /** Omit to create a new checklist; pass to edit an existing one. */
  checklistId?: string
  navigation: Navigation
}

/**
 * All of checklist-form's state and behavior, as a hook — the view calls
 * this directly and renders from its return value. No container
 * *component*, no props interface mirroring this hook's internals by hand.
 */
export function useChecklistFormContainer({ checklistId, navigation }: UseChecklistFormContainerProps) {
  const isEditing = Boolean(checklistId)
  const existingRest = useChecklistRestResult(checklistId)
  const existing = useEntity<Checklist>(
    api.checklists.findById,
    { id: checklistId ?? '' },
    checklistId ?? '',
    'checklist',
    existingRest,
  )
  const loading = isEditing && (existing === undefined || existing === null)

  const tagsCatalog = useTagsCatalog()
  const { show } = useUndoToast()

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [itemSheet, setItemSheet] = useState<ItemSheetState>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteState>(null)

  const { form, commit, clearDraft, hydrated, hasPersistedDraft } = useDraft<ChecklistFormValues>({
    key: `checklist:${checklistId ?? 'new'}`,
    schema: checklistFormSchema,
    defaultValues: checklistToFormValues(existing),
    autoCommit: isEditing,
    onCommit: (values) => {
      if (!checklistId) return
      enqueueOp(checklistSave, { id: checklistId, entity: buildChecklistEntity(existing ?? null, values) })
    },
  })
  // useDraft is called unconditionally (it's a hook), so it can't wait for
  // `existing` to load the way a two-component split used to. Once both the
  // server data and useDraft's own AsyncStorage check have settled, reset to
  // fresh server data — but only if hydration didn't already apply a real
  // persisted draft, or this would silently discard the user's own unsaved
  // edits regardless of which of the two async reads happened to win the race.
  useEffect(() => {
    if (!isEditing || !existing || !hydrated || hasPersistedDraft) return
    form.reset(checklistToFormValues(existing))
  }, [isEditing, existing, hydrated, hasPersistedDraft, form.reset])

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
    enqueueOp(checklistSave, { id: entity.id, entity, isCreate: true })
    void clearDraft()
    navigation.replace('checklistDetail', { checklistId: entity.id })
  }

  return {
    loading,
    isEditing,
    form,
    itemsArray,
    tagsCatalog,
    templates: isEditing ? undefined : checklistTemplates,
    selectedTemplateId,
    loadingTemplateId,
    templateError,
    itemSheet,
    itemSheetForm,
    pendingDelete,
    onBack: () => navigation.goBack(),
    onSelectTemplate: handleSelectTemplate,
    onAddOption: () => optionsArray.append({ label: '', semantic: 'neutro' }),
    onRemoveOption,
    onAddItem: openAddItem,
    onEditItemByKey,
    onRemoveItemByKey,
    onReorderItemsByKey,
    onCloseItemSheet: () => setItemSheet(null),
    onSaveItem,
    onCancelPendingDelete: () => setPendingDelete(null),
    onConfirmPendingDelete: () => {
      if (pendingDelete?.type === 'option') removeOptionWithUndo(pendingDelete.index)
      else if (pendingDelete?.type === 'item') removeItemWithUndo(pendingDelete.index)
      setPendingDelete(null)
    },
    onCreate: handleCreate,
  }
}
