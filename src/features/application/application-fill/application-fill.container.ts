import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import type { ItemCompletionVariant } from '@/components/ItemCard'
import { useTagsCatalog } from '@/features/tag/shared/use-tags-catalog'
import { useApplicationRestResult } from '@/features/application/shared/application.rest'
import type { Application, ApplicationItem } from '@/features/application/shared/application.types'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import { useChecklistRestResult } from '@/features/checklist/shared/checklist.rest'
import { applicationItemDraftSchema, type ApplicationItemDraftFormValues } from '@/features/application/shared/application.schema'
import { getDerivedState, getProgress } from '@/features/application/shared/application.utils'
import { normalizeApplication } from '@/features/application/shared/normalize-application'
import { enqueueOp, useEntity } from '@/lib/offline-queue'
import { useDraft } from '@/lib/forms'
import type { StackRoutesList } from '@/routes/types'
import { softDelete, updateMeta } from '../shared/application.ops'
import { useApplicationPhotos } from './use-application-photos'
import { useApplicationVoice } from './use-application-voice'
import { useItemAnswers } from './use-item-answers'
import { useItemGroups } from './use-item-groups'
import { useMetaSheet } from './use-meta-sheet'
import { useNewItemSheet } from './use-new-item-sheet'
import { usePendingItemEdits } from './use-pending-item-edits'

type Navigation = NativeStackNavigationProp<StackRoutesList, keyof StackRoutesList>

export interface UseApplicationFillContainerProps {
  checklistId: string
  applicationId: string
  navigation: Navigation
}

const EMPTY_CHECKLIST: Checklist = {
  id: '',
  title: '',
  tagsIds: [],
  options: [],
  source: 'manual',
  items: [],
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
}

/**
 * All of application-fill's state and behavior, as a hook. Every hook call
 * inside here runs unconditionally on every render — `loading` can flip
 * from true to false across the lifetime of one mounted view, and hooks
 * can't be called conditionally — so this falls back to an empty
 * checklist/application while the real ones are still loading rather than
 * gating any hook call on them being present. Nothing here reacts to user
 * input until the view stops rendering the loading screen, so the empty
 * fallbacks are never actually seen — they just keep every downstream
 * useMemo/useCallback type-safe and rules-of-hooks-safe through that window.
 */
export function useApplicationFillContainer({
  checklistId,
  applicationId,
  navigation,
}: UseApplicationFillContainerProps) {
  const checklistRest = useChecklistRestResult(checklistId)
  const checklistData = useEntity<Checklist>(
    checklistRest,
    checklistId,
    'checklist',
  )
  const applicationRest = useApplicationRestResult(applicationId)
  const rawApplication = useEntity<Application>(
    applicationRest,
    applicationId,
    'application',
  )
  const normalizedApplication = useMemo(
    () => (rawApplication ? normalizeApplication(rawApplication) : null),
    [rawApplication],
  )
  const loading =
    checklistData === undefined ||
    rawApplication === undefined ||
    !checklistData ||
    !normalizedApplication

  const checklist = checklistData ?? EMPTY_CHECKLIST

  const { application, editItem, addPendingItem, flushPendingChanges } = usePendingItemEdits({
    normalizedApplication,
    checklistId,
  })

  const tagsCatalog = useTagsCatalog()
  const photos = useApplicationPhotos(application)

  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [applicationError, setApplicationError] = useState<string | null>(null)
  const [deleteConfirmationVisible, setDeleteConfirmationVisible] = useState(false)

  const voice = useApplicationVoice({ application, checklist, editItem, setApplicationError })

  const progress = useMemo(() => getProgress(application, checklist), [application, checklist])
  const groups = useItemGroups(application.items, checklist)
  const derivedState = getDerivedState(application, checklist)

  const resolveTagLabels = tagsCatalog.resolveLabels
  const resolveTagLabel = useCallback(
    (item: ApplicationItem) => resolveTagLabels(item.tagsIds)[0],
    [resolveTagLabels],
  )
  const positiveOptionLabel = checklist.options.find((option) => option.semantic === 'positivo')?.label
  const answers = useItemAnswers({ items: application.items, positiveOptionLabel, editItem })

  // --- item drawer (note/tags/quantity) ---------------------------------
  const itemDraft = useDraft<ApplicationItemDraftFormValues>({
    key: `application:${application.id}:item:${editingItemId ?? 'none'}`,
    schema: applicationItemDraftSchema,
    defaultValues: { note: '', tagsIds: [], quantity: null },
    autoCommit: false,
    onCommit: (values) => {
      if (!editingItemId) return
      editItem(editingItemId, values)
    },
  })
  // useLayoutEffect, not useEffect: this must apply before the drawer paints,
  // or it flashes the empty defaultValues for one frame before the real item
  // data lands — the original set these values synchronously in the same
  // click handler that opened the drawer, and this is the closest match to
  // that timing under the split-key useDraft setup.
  useLayoutEffect(() => {
    if (!editingItemId) return
    const item = application.items.find((candidate) => candidate.id === editingItemId)
    if (!item) return
    itemDraft.form.reset({ note: item.note, tagsIds: [...item.tagsIds], quantity: item.quantity })
    // Deliberately keyed on editingItemId alone, not on `application` as a
    // whole: this should re-seed when the drawer opens on a *different*
    // item, not every time the server round-trips some other field while
    // the same item is still open — that would fight the user mid-edit.
    // application.items.find and itemDraft.form.reset are both stable
    // (Array.prototype.find, RHF's own contract), so including them below
    // doesn't change when this actually re-runs.
  }, [editingItemId, application.items.find, itemDraft.form.reset])

  function handleOpenItemDrawer(itemId: string) {
    setEditingItemId(itemId)
  }

  function handleAddPhoto(itemId: string) {
    if (editingItemId === itemId) void itemDraft.commit()
    setEditingItemId(null)
    navigation.navigate('photoCapture', { applicationId: application.id, itemId })
  }

  const metaSheet = useMetaSheet({ application, checklistId, setApplicationError })
  const newItemSheet = useNewItemSheet({ application, addPendingItem })

  // --- photos ----------------------------------------------------------
  function handleAddApplicationPhoto() {
    navigation.navigate('photoCapture', { applicationId: application.id, itemId: null })
  }

  function handleBack() {
    flushPendingChanges()
    navigation.goBack()
  }

  function handleSaveDraft() {
    flushPendingChanges()
    navigation.goBack()
  }

  function handleComplete() {
    flushPendingChanges()
    const updatedAt = new Date().toISOString()
    enqueueOp(updateMeta, {
      applicationId: application.id,
      checklistId,
      status: 'completed',
      completedAt: updatedAt,
      updatedAt,
    })
    // popTo, not navigate/replace: checklistDetail is already below this
    // screen in the stack (it is the only way in here), so concluir must pop
    // back to it instead of stacking a second copy on top.
    navigation.popTo('checklistDetail', { checklistId })
  }

  function handleDelete() {
    setDeleteConfirmationVisible(true)
  }

  function confirmDelete() {
    enqueueOp(softDelete, { id: application.id, deletedAt: new Date().toISOString(), checklistId })
    setDeleteConfirmationVisible(false)
    navigation.popTo('checklistDetail', { checklistId })
  }

  const editingItem = editingItemId
    ? application.items.find((item) => item.id === editingItemId)
    : null
  const editingItemContainer = editingItem
    ? (groups.find((group) => group.children.some((child) => child.id === editingItem.id))
        ?.children ?? null)
    : null
  const editingItemIndex = editingItemContainer
    ? editingItemContainer.findIndex((child) => child.id === editingItem?.id)
    : -1
  const editingItemsTotal = editingItemContainer?.length ?? 0
  const itemDraftValues = editingItem ? itemDraft.form.watch() : null
  const editingItemCompletionVariant: ItemCompletionVariant =
    editingItem?.answer === positiveOptionLabel && positiveOptionLabel
      ? 'completed'
      : (editingItem?.workflowStatus ?? 'idle')

  return {
    loading,
    checklist,
    application,
    progress,
    derivedState,
    groups,
    resolveTagLabel,
    applicationError,
    tagsCatalog,
    uploadProgress: photos.uploadProgress,
    voiceState: voice.voiceState,
    lastVoiceTranscript: voice.lastVoiceTranscript,
    generatingSuggestions: voice.generatingSuggestions,
    viewer: photos.viewer,
    viewerPhotos: photos.viewerPhotos,
    editingApplication: metaSheet.editingApplication,
    metaForm: metaSheet.metaForm,
    addingItem: newItemSheet.addingItem,
    newItemForm: newItemSheet.newItemForm,
    deleteConfirmationVisible,
    editingItem: editingItem ?? null,
    editingItemIndex,
    editingItemsTotal,
    itemDraftValues,
    itemForm: itemDraft.form,
    editingItemCompletionVariant,
    onBack: handleBack,
    onDelete: handleDelete,
    onSaveDraft: handleSaveDraft,
    onComplete: handleComplete,
    onEditApplication: metaSheet.onEditApplication,
    onAddApplicationPhoto: handleAddApplicationPhoto,
    onRemoveApplicationAttachment: photos.onRemoveApplicationAttachment,
    onRetryApplicationAttachment: photos.onRetryApplicationAttachment,
    onOpenPhoto: photos.onOpenPhoto,
    onStartRecording: voice.onStartRecording,
    onStopRecording: voice.onStopRecording,
    onGenerateSuggestions: voice.onGenerateSuggestions,
    onOpenAddItem: newItemSheet.onOpenAddItem,
    onToggleComplete: answers.onToggleComplete,
    onToggleGroupComplete: answers.onToggleGroupComplete,
    onOpenDrawer: handleOpenItemDrawer,
    onAcceptSuggestion: answers.onAcceptSuggestion,
    onRejectSuggestion: answers.onRejectSuggestion,
    onCloseItemDrawer: () => setEditingItemId(null),
    onSelectStatus: answers.onSelectStatus,
    onAddPhoto: handleAddPhoto,
    onRemoveItemAttachment: photos.onRemoveItemAttachment,
    onRetryItemAttachment: photos.onRetryItemAttachment,
    onSaveItemDrawer: () => {
      void itemDraft.commit()
      setEditingItemId(null)
    },
    onCloseViewer: photos.onCloseViewer,
    onDeletePhotoFromViewer: photos.onDeletePhotoFromViewer,
    onCloseEditApplication: metaSheet.onCloseEditApplication,
    onSaveApplication: metaSheet.onSaveApplication,
    onCloseAddItem: newItemSheet.onCloseAddItem,
    onSaveNewItem: newItemSheet.onSaveNewItem,
    onCancelDelete: () => setDeleteConfirmationVisible(false),
    onConfirmDelete: confirmDelete,
  }
}

export type ApplicationFillContainer = ReturnType<typeof useApplicationFillContainer>
