import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache'
import { Screen } from '@/components'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import type { VoiceState } from '@/components/VoiceCard'
import type { ItemCompletionVariant } from '@/components/ItemCard'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import type { ApplicationItem, Checklist, WorkflowStatus } from '@/infra/domain/entities'
import {
  applicationItemDraftSchema,
  applicationMetaSchema,
  newApplicationItemSchema,
  type ApplicationItemDraftFormValues,
  type ApplicationMetaFormValues,
  type NewApplicationItemFormValues,
} from '@/infra/domain/schemas'
import { generateId } from '@/infra/id'
import {
  generateSuggestions,
  getDerivedState,
  getProgress,
  groupItemsByTitlePrefix,
  isItemAnswerComplete,
  prepareTranscriber,
  sortItemsByChecklistOrder,
  transcribeAudio,
  type ApplicationItemPatch,
} from '@/infra/services'
import { normalizeApplication } from '@/infra/convex'
import { useUploadStore } from '@/infra/uploads/upload-store'
import { enqueueOp, useEntity } from '@/lib/offline-queue'
import { useDraft } from '@/lib/forms'
import type { Application } from '@/infra/domain/entities'
import type { StackRoutesList } from '@/routes/types'
import { useAttachPhotos } from '../shared/use-attach-photos'
import { addItem, patchItem, softDelete, updateMeta } from './application-fill.ops'
import { ApplicationFillView } from './application-fill.view'
import { api } from '../../../../convex/_generated/api'

type Navigation = NativeStackNavigationProp<StackRoutesList, keyof StackRoutesList>

export interface ApplicationFillContainerProps {
  checklistId: string
  applicationId: string
  navigation: Navigation
}

export function ApplicationFillContainer({
  checklistId,
  applicationId,
  navigation,
}: ApplicationFillContainerProps) {
  const checklistData = useQuery(api.checklists.findById, { id: checklistId }) as
    | Checklist
    | null
    | undefined
  const rawApplication = useEntity<Application>(
    api.applications.findById,
    { id: applicationId },
    applicationId,
  )
  const application = useMemo(
    () => (rawApplication ? normalizeApplication(rawApplication) : null),
    [rawApplication],
  )
  const loading = checklistData === undefined || rawApplication === undefined

  if (loading || !checklistData || !application) {
    return (
      <Screen loading variant="nested" onBack={() => navigation.goBack()} title="Preenchimento" />
    )
  }

  return (
    <ApplicationFillReady
      checklist={checklistData}
      application={application}
      checklistId={checklistId}
      navigation={navigation}
    />
  )
}

interface ApplicationFillReadyProps {
  checklist: Checklist
  application: Application
  checklistId: string
  navigation: Navigation
}

function ApplicationFillReady({
  checklist,
  application,
  checklistId,
  navigation,
}: ApplicationFillReadyProps) {
  const tagsCatalog = useTagsCatalog()
  const { removeAttachment: removeAttachmentPipeline } = useAttachPhotos()
  const { startRecording, stopRecording } = useVoiceRecorder()
  const uploadProgress = useUploadStore((state) => state.progress)

  const [viewer, setViewer] = useState<{ itemId: string | null; index: number } | null>(null)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingApplication, setEditingApplication] = useState(false)
  const [applicationError, setApplicationError] = useState<string | null>(null)
  const [addingItem, setAddingItem] = useState(false)
  const [deleteConfirmationVisible, setDeleteConfirmationVisible] = useState(false)

  useEffect(() => {
    if (!FEATURE_FLAG.voice) return
    setVoiceState(application.transcript ? 'ready' : 'idle')
  }, [application.transcript])
  useEffect(() => {
    // Warm up the WhisperKit model (downloads on first run) so stopping a
    // recording doesn't stall while the model loads. Errors surface later on
    // the actual transcription attempt.
    if (FEATURE_FLAG.voice) void prepareTranscriber()
  }, [])

  const progress = useMemo(() => getProgress(application), [application])
  // One sort and one completeness pass feed both lists below, instead of each
  // re-sorting every item and re-deriving completeness on every answer tap.
  const sortedItems = useMemo(
    () => sortItemsByChecklistOrder(application.items, checklist),
    [application.items, checklist],
  )
  const completedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of sortedItems) {
      if (isItemAnswerComplete(item, checklist)) ids.add(item.id)
    }
    return ids
  }, [sortedItems, checklist])
  const groups = useMemo(
    () =>
      groupItemsByTitlePrefix(sortedItems).map((group) => {
        const incomplete = group.children.filter((item) => !completedIds.has(item.id))
        const completed = group.children.filter((item) => completedIds.has(item.id))
        return {
          key: group.label ?? 'ungrouped',
          title: group.label ?? 'Outros itens',
          total: group.children.length,
          answered: completed.length,
          // Completed items sink to the end of their own group's list instead
          // of moving to a separate section, so the group they belong to stays
          // legible while still keeping them out of the way of active items.
          children: [...incomplete, ...completed],
        }
      }),
    [sortedItems, completedIds],
  )
  const derivedState = getDerivedState(application)

  const editItem = useCallback(
    (itemId: string, patch: ApplicationItemPatch) => {
      enqueueOp(patchItem, {
        applicationId: application.id,
        itemId,
        patch,
        updatedAt: new Date().toISOString(),
      })
    },
    [application.id],
  )

  const resolveTagLabels = tagsCatalog.resolveLabels
  const resolveTagLabel = useCallback(
    (item: ApplicationItem) => resolveTagLabels(item.tagsIds)[0],
    [resolveTagLabels],
  )
  const handleAnswerChange = useCallback(
    (itemId: string, answer: string) => {
      editItem(itemId, { answer, suggested: false, suggestionSource: null })
    },
    [editItem],
  )
  const positiveOptionLabel = checklist.options.find((option) => option.semantic === 'positivo')?.label
  const handleSetWorkflowStatus = useCallback(
    (itemId: string, workflowStatus: WorkflowStatus | null) => {
      editItem(itemId, { workflowStatus })
    },
    [editItem],
  )
  const handleToggleComplete = useCallback(
    (itemId: string) => {
      if (!positiveOptionLabel) return
      const item = application.items.find((candidate) => candidate.id === itemId)
      const complete = item?.answer === positiveOptionLabel
      handleAnswerChange(itemId, complete ? '' : positiveOptionLabel)
      if (!complete && item?.workflowStatus) handleSetWorkflowStatus(itemId, null)
    },
    [application.items, handleAnswerChange, handleSetWorkflowStatus, positiveOptionLabel],
  )
  const handleToggleGroupComplete = useCallback(
    (itemIds: string[], complete: boolean) => {
      if (complete && !positiveOptionLabel) return
      for (const itemId of itemIds) {
        handleAnswerChange(itemId, complete ? (positiveOptionLabel as string) : '')
        if (complete) {
          const item = application.items.find((candidate) => candidate.id === itemId)
          if (item?.workflowStatus) handleSetWorkflowStatus(itemId, null)
        }
      }
    },
    [application.items, handleAnswerChange, handleSetWorkflowStatus, positiveOptionLabel],
  )
  const handleSelectStatus = useCallback(
    (itemId: string, status: ItemCompletionVariant) => {
      if (status === 'completed' || status === 'idle') {
        const item = application.items.find((candidate) => candidate.id === itemId)
        const complete = item?.answer === positiveOptionLabel
        const shouldComplete = status === 'completed'
        if (complete !== shouldComplete && positiveOptionLabel) {
          handleAnswerChange(itemId, shouldComplete ? positiveOptionLabel : '')
        }
        if (item?.workflowStatus) handleSetWorkflowStatus(itemId, null)
        return
      }
      handleSetWorkflowStatus(itemId, status)
    },
    [application.items, handleAnswerChange, handleSetWorkflowStatus, positiveOptionLabel],
  )
  const handleAcceptSuggestion = useCallback(
    (itemId: string) => {
      if (!FEATURE_FLAG.suggestion) return
      editItem(itemId, { suggested: false, suggestionSource: null })
    },
    [editItem],
  )
  const handleRejectSuggestion = useCallback(
    (itemId: string) => {
      if (!FEATURE_FLAG.suggestion) return
      editItem(itemId, { suggested: false, suggestionSource: null, answer: '', note: '' })
    },
    [editItem],
  )

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

  // --- application meta (tags/date) -------------------------------------
  const metaDraft = useDraft<ApplicationMetaFormValues>({
    key: `application:${application.id}:meta`,
    schema: applicationMetaSchema,
    defaultValues: { tagsIds: [], date: '' },
    autoCommit: false,
    onCommit: (values) => {
      enqueueOp(updateMeta, {
        applicationId: application.id,
        tagsIds: values.tagsIds,
        date: values.date,
        updatedAt: new Date().toISOString(),
      })
    },
  })

  function handleOpenEditApplication() {
    metaDraft.form.reset({ tagsIds: application.tagsIds, date: application.date })
    setApplicationError(null)
    setEditingApplication(true)
  }

  async function handleSaveApplication() {
    const committed = await metaDraft.commit()
    if (!committed) return
    setEditingApplication(false)
    void metaDraft.clearDraft()
  }

  // --- ad-hoc item ---------------------------------------------------
  const newItemDraft = useDraft<NewApplicationItemFormValues>({
    key: `application:${application.id}:new-item`,
    schema: newApplicationItemSchema,
    defaultValues: { title: '', tagsIds: [] },
    autoCommit: false,
    onCommit: (values) => {
      const now = new Date().toISOString()
      const item = {
        id: generateId('aitem_'),
        position: application.items.length,
        checklistItemId: null,
        title: values.title,
        description: '',
        answer: '',
        answeredAt: null,
        note: '',
        quantity: null,
        attachments: [],
        tagsIds: [...values.tagsIds],
        suggested: false,
        suggestionSource: null,
        workflowStatus: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      enqueueOp(addItem, { applicationId: application.id, item, updatedAt: now })
    },
  })

  function handleOpenAddItem() {
    newItemDraft.form.reset({ title: '', tagsIds: [] })
    setAddingItem(true)
  }

  async function handleSaveNewItem() {
    const committed = await newItemDraft.commit()
    if (!committed) return
    setAddingItem(false)
    void newItemDraft.clearDraft()
  }

  // --- photos ----------------------------------------------------------
  function handleAddApplicationPhoto() {
    navigation.navigate('photoCapture', { applicationId: application.id, itemId: null })
  }

  function removeApplicationAttachment(attachmentId: string) {
    const attachment = application.attachments.find((candidate) => candidate.id === attachmentId)
    if (!attachment) return
    removeAttachmentPipeline({ applicationId: application.id, itemId: null, attachment })
  }

  function removeItemAttachment(itemId: string, attachmentId: string) {
    const item = application.items.find((candidate) => candidate.id === itemId)
    const attachment = item?.attachments.find((candidate) => candidate.id === attachmentId)
    if (!attachment) return
    removeAttachmentPipeline({ applicationId: application.id, itemId, attachment })
  }

  function retryApplicationAttachment(attachmentId: string) {
    const attachment = application.attachments.find((candidate) => candidate.id === attachmentId)
    if (!attachment) return
    useUploadStore.getState().enqueue({ applicationId: application.id, itemId: null, attachment })
  }

  function retryItemAttachment(itemId: string, attachmentId: string) {
    const item = application.items.find((candidate) => candidate.id === itemId)
    const attachment = item?.attachments.find((candidate) => candidate.id === attachmentId)
    if (!attachment) return
    useUploadStore.getState().enqueue({ applicationId: application.id, itemId, attachment })
  }

  // --- voice / suggestions (feature-flagged off today) ------------------
  async function handleStartRecording() {
    if (!FEATURE_FLAG.voice) return
    try {
      await startRecording()
      setVoiceState('recording')
    } catch (error) {
      setApplicationError(
        error instanceof Error ? error.message : 'Não foi possível iniciar a gravação',
      )
    }
  }

  async function handleStopRecording() {
    if (!FEATURE_FLAG.voice) return
    setVoiceState('processing')
    try {
      const uri = await stopRecording()
      if (!uri) throw new Error('Gravação vazia')
      const transcript = await transcribeAudio(uri)
      enqueueOp(updateMeta, {
        applicationId: application.id,
        transcript,
        updatedAt: new Date().toISOString(),
      })
      setVoiceState('ready')
    } catch (error) {
      setApplicationError(
        error instanceof Error ? error.message : 'Não foi possível transcrever a gravação',
      )
      setVoiceState(application.transcript ? 'ready' : 'idle')
    }
  }

  async function handleGenerateSuggestions() {
    if (!FEATURE_FLAG.suggestion) return
    setGeneratingSuggestions(true)
    try {
      const suggestions = await generateSuggestions(checklist, application)
      for (const suggestion of suggestions) {
        editItem(suggestion.itemId, {
          answer: suggestion.answer,
          note: suggestion.note ?? '',
          suggested: true,
          suggestionSource: 'transcript' as const,
        })
      }
    } finally {
      setGeneratingSuggestions(false)
    }
  }

  // --- lifecycle: complete / delete -------------------------------------
  function handleComplete() {
    const updatedAt = new Date().toISOString()
    enqueueOp(updateMeta, {
      applicationId: application.id,
      status: 'completed',
      completedAt: updatedAt,
      updatedAt,
    })
    navigation.navigate('checklistDetail', { checklistId })
  }

  function handleDelete() {
    setDeleteConfirmationVisible(true)
  }

  function confirmDelete() {
    enqueueOp(softDelete, { id: application.id, deletedAt: new Date().toISOString() })
    setDeleteConfirmationVisible(false)
    navigation.replace('checklistDetail', { checklistId })
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

  const viewerAttachments = viewer
    ? (viewer.itemId === null
        ? application.attachments
        : (application.items.find((item) => item.id === viewer.itemId)?.attachments ?? [])
      ).filter((attachment) => !attachment.deletedAt)
    : []
  const viewerPhotos = viewerAttachments.map((attachment) => ({
    id: attachment.id,
    uri: attachment.url ?? attachment.localUri,
    uploading: attachment.uploadStatus === 'pending',
    progress: uploadProgress[attachment.id] ?? 0,
  }))

  return (
    <ApplicationFillView
      checklist={checklist}
      application={application}
      progress={progress}
      derivedState={derivedState}
      groups={groups}
      resolveTagLabel={resolveTagLabel}
      applicationError={applicationError}
      tagsCatalog={tagsCatalog}
      uploadProgress={uploadProgress}
      voiceState={voiceState}
      generatingSuggestions={generatingSuggestions}
      viewer={viewer}
      viewerPhotos={viewerPhotos}
      editingApplication={editingApplication}
      metaForm={metaDraft.form}
      addingItem={addingItem}
      newItemForm={newItemDraft.form}
      deleteConfirmationVisible={deleteConfirmationVisible}
      editingItem={editingItem ?? null}
      editingItemIndex={editingItemIndex}
      editingItemsTotal={editingItemsTotal}
      itemDraftValues={itemDraftValues}
      itemForm={itemDraft.form}
      editingItemCompletionVariant={editingItemCompletionVariant}
      onBack={() => navigation.goBack()}
      onDelete={handleDelete}
      onComplete={handleComplete}
      onEditApplication={handleOpenEditApplication}
      onAddApplicationPhoto={handleAddApplicationPhoto}
      onRemoveApplicationAttachment={removeApplicationAttachment}
      onRetryApplicationAttachment={retryApplicationAttachment}
      onOpenPhoto={(itemId, index) => setViewer({ itemId, index })}
      onStartRecording={handleStartRecording}
      onStopRecording={handleStopRecording}
      onGenerateSuggestions={handleGenerateSuggestions}
      onOpenAddItem={handleOpenAddItem}
      onToggleComplete={handleToggleComplete}
      onToggleGroupComplete={handleToggleGroupComplete}
      onOpenDrawer={handleOpenItemDrawer}
      onAcceptSuggestion={handleAcceptSuggestion}
      onRejectSuggestion={handleRejectSuggestion}
      onError={setApplicationError}
      onCloseItemDrawer={() => setEditingItemId(null)}
      onSelectStatus={handleSelectStatus}
      onAddPhoto={handleAddPhoto}
      onRemoveItemAttachment={removeItemAttachment}
      onRetryItemAttachment={retryItemAttachment}
      onSaveItemDrawer={() => {
        void itemDraft.commit()
        setEditingItemId(null)
      }}
      onCloseViewer={() => setViewer(null)}
      onDeletePhotoFromViewer={(attachmentId) => {
        if (!viewer) return
        if (viewer.itemId === null) removeApplicationAttachment(attachmentId)
        else removeItemAttachment(viewer.itemId, attachmentId)
      }}
      onCloseEditApplication={() => setEditingApplication(false)}
      onSaveApplication={handleSaveApplication}
      onCloseAddItem={() => setAddingItem(false)}
      onSaveNewItem={handleSaveNewItem}
      onCancelDelete={() => setDeleteConfirmationVisible(false)}
      onConfirmDelete={confirmDelete}
    />
  )
}
