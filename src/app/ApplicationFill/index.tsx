import { BottomSheetView } from '@gorhom/bottom-sheet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ScrollViewContainer } from 'react-native-reorderable-list'
import {
  AppBottomSheet,
  Badge,
  ConfirmBottomSheet,
  DatePickerField,
  Input,
  ItemDrawer,
  PhotoViewer,
  ProgressBar,
  Screen,
  TagChipList,
  TagMultiSelect,
  VoiceCard,
} from '@/components'
import { Icon } from '@/components/Icon'
import { ApplicationItemGroupSection } from './components/ApplicationItemGroupSection'
import { useSheetFooterActions } from '@/components/SheetFooterActions'
import { VoiceState } from '@/components/VoiceCard'
import { ApplicationGallery } from './components/ApplicationGallery'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import { useApplicationFill } from '@/hooks/useApplicationFill'
import { useApplicationMutations } from '@/hooks/useApplicationMutations'
import { useAttachPhotos } from '@/hooks/useAttachPhotos'
import { useReorderablePanGesture } from '@/hooks/useReorderablePanGesture'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
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
} from '@/infra/services'
import { useUploadStore } from '@/infra/uploads/upload-store'
import { StackRoutesProps } from '@/routes/types'
import { colors } from '@/styles'
import { haptics } from '@/utils/haptics'
import { styles } from './styles'


const DERIVED_STATE_LABEL = {
  not_started: 'Não iniciada',
  in_progress: 'Executando',
  completed: 'Completa',
} as const


export function ApplicationFill({
  navigation,
  route,
}: StackRoutesProps<'applicationFill'>) {
  const { checklistId, applicationId } = route.params
  const { checklist, application: applicationData, loading } = useApplicationFill(
    checklistId,
    applicationId,
  )
  const mutations = useApplicationMutations()
  const { removeAttachment: removeAttachmentPipeline } = useAttachPhotos()
  const tagsCatalog = useTagsCatalog()
  const { startRecording, stopRecording } = useVoiceRecorder()
  const uploadProgress = useUploadStore((state) => state.progress)
  const [viewer, setViewer] = useState<{ itemId: string | null; index: number } | null>(
    null,
  )

  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemDraft, setEditingItemDraft] = useState<{
    note: string
    tagsIds: string[]
    quantity: number | null
  } | null>(null)
  const [editingApplication, setEditingApplication] = useState(false)
  const [draftTagsIds, setDraftTagsIds] = useState<string[]>([])
  const [draftDate, setDraftDate] = useState('')
  const [applicationError, setApplicationError] = useState<string | null>(null)
  const [addingItem, setAddingItem] = useState(false)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [newItemTagsIds, setNewItemTagsIds] = useState<string[]>([])
  const [newItemError, setNewItemError] = useState<string | null>(null)
  const [deleteConfirmationVisible, setDeleteConfirmationVisible] =
    useState(false)
  const [deleting, setDeleting] = useState(false)
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(),
  )
  const submitted = useRef(false)
  const currentApplicationId = applicationData?.id
  const currentTranscript = applicationData?.transcript
  useEffect(() => {
    if (!FEATURE_FLAG.voice || !currentApplicationId) return
    setVoiceState(currentTranscript ? 'ready' : 'idle')
  }, [currentApplicationId, currentTranscript])
  useEffect(() => {
    // Warm up the WhisperKit model (downloads on first run) so stopping a
    // recording doesn't stall while the model loads. Errors surface later on
    // the actual transcription attempt.
    if (FEATURE_FLAG.voice) void prepareTranscriber()
  }, [])

  const panGesture = useReorderablePanGesture()
  const progress = useMemo(
    () => (applicationData ? getProgress(applicationData) : { answered: 0, total: 0 }),
    [applicationData],
  )
  const groups = useMemo(() => {
    if (!applicationData || !checklist) return []
    const sortedAllItems = sortItemsByChecklistOrder(applicationData.items, checklist)
    return groupItemsByTitlePrefix(sortedAllItems).map((group) => ({
      key: group.label ?? 'ungrouped',
      title: group.label ?? 'Outros itens',
      total: group.children.length,
      answered: group.children.filter((item) => isItemAnswerComplete(item, checklist))
        .length,
      // completed items move to the "Concluídos" section below instead of
      // sinking within this list, so answering something never reshuffles
      // the drag-reorderable list the user is currently looking at.
      children: group.children.filter((item) => !isItemAnswerComplete(item, checklist)),
    }))
  }, [applicationData, checklist])
  const completedItems = useMemo(() => {
    if (!applicationData || !checklist) return []
    return sortItemsByChecklistOrder(applicationData.items, checklist).filter((item) =>
      isItemAnswerComplete(item, checklist),
    )
  }, [applicationData, checklist])
  const derivedState = applicationData
    ? getDerivedState(applicationData)
    : 'not_started'
  function toggleGroup(groupKey: string) {
    setExpandedGroupIds((current) => {
      const next = new Set(current)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }
  const renderEditApplicationFooter = useSheetFooterActions({
    confirmLabel: 'Salvar',
    onConfirm: handleSaveApplication,
  })
  const renderAddItemFooter = useSheetFooterActions({
    confirmLabel: 'Adicionar',
    onConfirm: handleSaveNewItem,
  })
  if (loading || !checklist || !applicationData) {
    return (
      <Screen
        loading
        variant="nested"
        onBack={() => navigation.goBack()}
        title="Preenchimento"
      >
        {null}
      </Screen>
    )
  }
  const application = applicationData
  function handleAnswerChange(itemId: string, answer: string) {
    const updatedAt = new Date().toISOString()
    void mutations
      .patchItem({
        applicationId: application.id,
        itemId,
        patch: { answer, suggested: false, suggestionSource: null },
        updatedAt,
      })
      .catch(() => setApplicationError('Não foi possível salvar a resposta'))
  }

  function handleAddPhoto(itemId: string) {
    if (editingItemId === itemId && editingItemDraft) {
      const updatedAt = new Date().toISOString()
      void mutations
        .patchItem({
          applicationId: application.id,
          itemId,
          patch: editingItemDraft,
          updatedAt,
        })
        .catch(() => setApplicationError('Não foi possível salvar o item'))
    }
    setEditingItemId(null)
    setEditingItemDraft(null)
    navigation.navigate('photoCapture', { applicationId: application.id, itemId })
  }

  function handleAddApplicationPhoto() {
    navigation.navigate('photoCapture', { applicationId: application.id, itemId: null })
  }

  function removeApplicationAttachment(attachmentId: string) {
    const attachment = application.attachments.find(
      (candidate) => candidate.id === attachmentId,
    )
    if (!attachment) return
    removeAttachmentPipeline({
      applicationId: application.id,
      itemId: null,
      attachment,
      onError: () => setApplicationError('Não foi possível remover a foto'),
    })
  }

  function removeItemAttachment(itemId: string, attachmentId: string) {
    const item = application.items.find((candidate) => candidate.id === itemId)
    const attachment = item?.attachments.find((candidate) => candidate.id === attachmentId)
    if (!attachment) return
    removeAttachmentPipeline({
      applicationId: application.id,
      itemId,
      attachment,
      onError: () => setApplicationError('Não foi possível remover a foto'),
    })
  }

  function retryApplicationAttachment(attachmentId: string) {
    const attachment = application.attachments.find(
      (candidate) => candidate.id === attachmentId,
    )
    if (!attachment) return
    useUploadStore.getState().enqueue({ applicationId: application.id, itemId: null, attachment })
  }

  function retryItemAttachment(itemId: string, attachmentId: string) {
    const item = application.items.find((candidate) => candidate.id === itemId)
    const attachment = item?.attachments.find((candidate) => candidate.id === attachmentId)
    if (!attachment) return
    useUploadStore.getState().enqueue({ applicationId: application.id, itemId, attachment })
  }

  async function handleStartRecording() {
    if (!FEATURE_FLAG.voice) return
    try {
      await startRecording()
      setVoiceState('recording')
    } catch (error) {
      setApplicationError(
        error instanceof Error
          ? error.message
          : 'Não foi possível iniciar a gravação',
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
      const updatedAt = new Date().toISOString()
      void mutations
        .updateMeta({
          applicationId: application.id,
          transcript,
          updatedAt,
        })
        .catch(() => setApplicationError('Não foi possível salvar a transcrição'))
      setVoiceState('ready')
    } catch (error) {
      setApplicationError(
        error instanceof Error
          ? error.message
          : 'Não foi possível transcrever a gravação',
      )
      setVoiceState(application.transcript ? 'ready' : 'idle')
    }
  }

  async function handleGenerateSuggestions() {
    if (!FEATURE_FLAG.suggestion) return
    setGeneratingSuggestions(true)
    try {
      const suggestions = await generateSuggestions(checklist!, application)
      const updatedAt = new Date().toISOString()
      void mutations
        .patchItems({
          applicationId: application.id,
          patches: suggestions.map((suggestion) => ({
            itemId: suggestion.itemId,
            patch: {
              answer: suggestion.answer,
              note: suggestion.note ?? '',
              suggested: true,
              suggestionSource: 'transcript' as const,
            },
          })),
          updatedAt,
        })
        .catch(() => setApplicationError('Não foi possível salvar as sugestões'))
    } finally {
      setGeneratingSuggestions(false)
    }
  }

  function handleAcceptSuggestion(itemId: string) {
    if (!FEATURE_FLAG.suggestion) return
    const updatedAt = new Date().toISOString()
    void mutations
      .patchItem({
        applicationId: application.id,
        itemId,
        patch: { suggested: false, suggestionSource: null },
        updatedAt,
      })
      .catch(() => setApplicationError('Não foi possível aceitar a sugestão'))
  }

  function handleRejectSuggestion(itemId: string) {
    if (!FEATURE_FLAG.suggestion) return
    const updatedAt = new Date().toISOString()
    void mutations
      .patchItem({
        applicationId: application.id,
        itemId,
        patch: {
          suggested: false,
          suggestionSource: null,
          answer: '',
          note: '',
        },
        updatedAt,
      })
      .catch(() => setApplicationError('Não foi possível rejeitar a sugestão'))
  }

  function handleComplete() {
    if (submitted.current) return
    submitted.current = true
    const updatedAt = new Date().toISOString()
    void mutations
      .updateMeta({
        applicationId: application.id,
        status: 'completed',
        completedAt: updatedAt,
        updatedAt,
      })
      .catch(() => setApplicationError('Não foi possível concluir a aplicação'))
    haptics.success()
    navigation.navigate('checklistDetail', { checklistId })
  }

  function handleDelete() {
    setDeleteConfirmationVisible(true)
  }

  function confirmDelete() {
    if (deleting) return
    setDeleting(true)
    void mutations
      .softDelete({ id: application.id, deletedAt: new Date().toISOString() })
      .catch(() => setApplicationError('Não foi possível excluir a aplicação'))
    setDeleteConfirmationVisible(false)
    navigation.replace('checklistDetail', { checklistId })
  }

  function handleOpenEditApplication() {
    setDraftTagsIds(application.tagsIds)
    setDraftDate(application.date)
    setApplicationError(null)
    setEditingApplication(true)
  }

  function handleSaveApplication() {
    if (draftTagsIds.length === 0) {
      haptics.error()
      setApplicationError('Selecione ao menos uma tag')
      return
    }
    const updatedAt = new Date().toISOString()
    void mutations
      .updateMeta({
        applicationId: application.id,
        tagsIds: draftTagsIds,
        date: draftDate,
        updatedAt,
      })
      .catch(() => setApplicationError('Não foi possível salvar a aplicação'))
    setEditingApplication(false)
  }

  function handleOpenAddItem() {
    setNewItemTitle('')
    setNewItemTagsIds([])
    setNewItemError(null)
    setAddingItem(true)
  }

  function handleSaveNewItem() {
    if (!newItemTitle.trim()) {
      haptics.error()
      setNewItemError('Informe um título para o item')
      return
    }
    const now = new Date().toISOString()
    const item = {
      id: generateId('aitem_'),
      position: application.items.length,
      checklistItemId: null,
      title: newItemTitle.trim(),
      description: '',
      answer: '',
      answeredAt: null,
      note: '',
      quantity: null,
      attachments: [],
      tagsIds: [...newItemTagsIds],
      suggested: false,
      suggestionSource: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    void mutations
      .addItem({ applicationId: application.id, item, updatedAt: now })
      .catch(() => setNewItemError('Não foi possível adicionar o item'))
    setAddingItem(false)
  }
  function handleOpenItemDrawer(itemId: string) {
    const item = application.items.find((candidate) => candidate.id === itemId)
    if (!item) return
    setEditingItemDraft({
      note: item.note,
      tagsIds: [...item.tagsIds],
      quantity: item.quantity,
    })
    setEditingItemId(itemId)
  }

  const editingItem = editingItemId
    ? application.items.find((item) => item.id === editingItemId)
    : null
  const editingItemContainer = editingItem
    ? (groups.find((group) => group.children.some((child) => child.id === editingItem.id))
        ?.children ??
      (completedItems.some((child) => child.id === editingItem.id) ? completedItems : null))
    : null
  const editingItemIndex = editingItemContainer
    ? editingItemContainer.findIndex((child) => child.id === editingItem?.id)
    : -1
  const editingItemsTotal = editingItemContainer?.length ?? 0
  const itemDraft = editingItem && editingItemDraft
    ? editingItemDraft
    : editingItem
      ? { note: editingItem.note, tagsIds: editingItem.tagsIds, quantity: editingItem.quantity }
      : null

  const viewerAttachments = viewer
    ? (viewer.itemId === null
        ? application.attachments
        : application.items.find((item) => item.id === viewer.itemId)?.attachments ?? []
      ).filter((attachment) => !attachment.deletedAt)
    : []
  const viewerPhotos = viewerAttachments.map((attachment) => ({
    id: attachment.id,
    uri: attachment.url ?? attachment.localUri,
    uploading: attachment.uploadStatus === 'pending',
    progress: uploadProgress[attachment.id] ?? 0,
  }))

  return (
    <Screen
      ScrollComponent={ScrollViewContainer}
      variant="nested"
      navTitleTone="muted"
      onBack={() => navigation.goBack()}
      title={checklist.title}
      headerRight={
        <View style={styles.headerActions}>
          <Badge
            label={
              application.status === 'completed' ? 'Concluída' : 'Rascunho'
            }
            tone={application.status === 'completed' ? 'completed' : 'draft'}
          />
          <Pressable
            style={({ pressed }) => [
              styles.headerActionButton,
              pressed && { opacity: 0.7 },
            ]}
            hitSlop={12}
            onPress={handleDelete}
            accessibilityLabel="Excluir aplicação"
          >
            <Icon name="trash-2" size={16} color={colors.danger.base} />
          </Pressable>
        </View>
      }
      footer={
        <View style={styles.footerActions}>
          <Pressable
            style={({ pressed }) => [
              styles.completeButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={handleComplete}
          >
            <Icon name="check" size={18} color={colors.white} />
            <Text style={styles.completeButtonText}>Concluir aplicação</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.tagsRow}>
        <TagChipList labels={tagsCatalog.resolveLabels(application.tagsIds)} />
        <Pressable
          style={({ pressed }) => [
            styles.editAppButton,
            pressed && { opacity: 0.7 },
          ]}
          hitSlop={12}
          onPress={handleOpenEditApplication}
          accessibilityLabel="Editar tags e data da aplicação"
        >
          <Icon name="edit-pen" size={12} color={colors.gray[600]} />
        </Pressable>
      </View>

      <View style={styles.progressCol}>
        <Text style={styles.progressText}>
          {progress.answered}/{progress.total} respondidos ·{' '}
          {DERIVED_STATE_LABEL[derivedState]}
        </Text>
        {applicationError ? (
          <Text style={styles.modalError}>{applicationError}</Text>
        ) : null}
        <ProgressBar
          progress={progress.total > 0 ? progress.answered / progress.total : 0}
        />
      </View>
      <View style={styles.gallerySection}>
        <View style={styles.galleryHeader}>
          <View>
            <Text style={styles.galleryTitle}>Galeria da aplicação</Text>
            <Text style={styles.gallerySubtitle}>
              {
                application.attachments.filter(
                  (attachment) => !attachment.deletedAt,
                ).length
              }{' '}
              anexadas
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.addPhotoButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={handleAddApplicationPhoto}
          >
            <Icon name="camera" size={16} color={colors.blue.base} />
            <Text style={styles.addPhotoButtonText}>Adicionar</Text>
          </Pressable>
        </View>
        {application.gallerySourceApplicationId ? (
          <Text style={styles.galleryReference}>
            Galeria da aplicação anterior disponível como referência.
          </Text>
        ) : null}
        <ApplicationGallery
          attachments={application.attachments}
          uploadProgress={uploadProgress}
          onRemoveAttachment={removeApplicationAttachment}
          onRetryAttachment={retryApplicationAttachment}
          onOpenPhoto={(index) => setViewer({ itemId: null, index })}
        />
      </View>

      {FEATURE_FLAG.voice && (
        <VoiceCard
          state={voiceState}
          transcript={application.transcript}
          onStart={handleStartRecording}
          onStop={handleStopRecording}
          onGenerateSuggestions={handleGenerateSuggestions}
          generatingSuggestions={generatingSuggestions}
        />
      )}

      <View style={styles.itemsHeaderRow}>
        <Text style={styles.itemsTitle}>Itens do checklist</Text>
        <Pressable
          style={({ pressed }) => [
            styles.addItemButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleOpenAddItem}
          accessibilityLabel="Adicionar item avulso"
        >
          <Icon name="plus" size={14} color={colors.blue.base} />
          <Text style={styles.addItemButtonText}>Adicionar item</Text>
        </Pressable>
      </View>

      <View style={styles.groupsList}>
        {groups.map((group) => (
          <ApplicationItemGroupSection
            key={group.key}
            title={group.title}
            groupItems={group.children}
            total={group.total}
            answered={group.answered}
            checklist={checklist}
            expanded={expandedGroupIds.has(group.key)}
            onToggle={() => toggleGroup(group.key)}
            suggestionEnabled={FEATURE_FLAG.suggestion}
            panGesture={panGesture}
            resolveTagLabel={(item) => tagsCatalog.resolveLabels(item.tagsIds)[0]}
            onAnswerChange={handleAnswerChange}
            onOpenDrawer={handleOpenItemDrawer}
            onAcceptSuggestion={handleAcceptSuggestion}
            onRejectSuggestion={handleRejectSuggestion}
            onError={setApplicationError}
          />
        ))}
        {completedItems.length > 0 ? (
          <ApplicationItemGroupSection
            title="Concluídos"
            groupItems={completedItems}
            total={completedItems.length}
            answered={completedItems.length}
            checklist={checklist}
            expanded={expandedGroupIds.has('completed')}
            onToggle={() => toggleGroup('completed')}
            suggestionEnabled={FEATURE_FLAG.suggestion}
            panGesture={panGesture}
            resolveTagLabel={(item) => tagsCatalog.resolveLabels(item.tagsIds)[0]}
            onAnswerChange={handleAnswerChange}
            onOpenDrawer={handleOpenItemDrawer}
            onAcceptSuggestion={handleAcceptSuggestion}
            onRejectSuggestion={handleRejectSuggestion}
            onError={setApplicationError}
          />
        ) : null}
      </View>

      {editingItem && (
        <ItemDrawer
          visible={Boolean(editingItem)}
          onClose={() => {
            setEditingItemId(null)
            setEditingItemDraft(null)
          }}
          itemIndex={editingItemIndex + 1}
          itemsTotal={editingItemsTotal}
          title={editingItem.title}
          note={itemDraft?.note ?? editingItem.note}
          onNoteChange={(note) =>
            setEditingItemDraft((current) => ({
              note,
              tagsIds: current?.tagsIds ?? editingItem.tagsIds,
              quantity: current?.quantity ?? editingItem.quantity,
            }))
          }
          tagsIds={itemDraft?.tagsIds ?? editingItem.tagsIds}
          availableTags={tagsCatalog.activeTags}
          allTagsById={tagsCatalog.tagsById}
          onChangeTags={(tagsIds) =>
            setEditingItemDraft((current) => ({
              note: current?.note ?? editingItem.note,
              tagsIds,
              quantity: current?.quantity ?? editingItem.quantity,
            }))
          }
          onCreateTag={tagsCatalog.createTag}
          quantity={itemDraft?.quantity ?? editingItem.quantity}
          onQuantityChange={(quantity) =>
            setEditingItemDraft((current) => ({
              note: current?.note ?? editingItem.note,
              tagsIds: current?.tagsIds ?? editingItem.tagsIds,
              quantity,
            }))
          }
          attachments={editingItem.attachments}
          uploadProgress={uploadProgress}
          onAddPhoto={() => handleAddPhoto(editingItem.id)}
          onRemoveAttachment={(attachmentId) =>
            removeItemAttachment(editingItem.id, attachmentId)
          }
          onRetryAttachment={(attachmentId) =>
            retryItemAttachment(editingItem.id, attachmentId)
          }
          onOpenPhoto={(index) => setViewer({ itemId: editingItem.id, index })}
          onSave={() => {
            if (!itemDraft) return
            const updatedAt = new Date().toISOString()
            void mutations
              .patchItem({
                applicationId: application.id,
                itemId: editingItem.id,
                patch: itemDraft,
                updatedAt,
              })
              .catch(() => setApplicationError('Não foi possível salvar o item'))
            setEditingItemId(null)
            setEditingItemDraft(null)
          }}
        />
      )}

      <PhotoViewer
        visible={viewer !== null}
        photos={viewerPhotos}
        initialIndex={viewer?.index ?? 0}
        onClose={() => setViewer(null)}
        onDelete={(attachmentId) => {
          if (!viewer) return
          if (viewer.itemId === null) removeApplicationAttachment(attachmentId)
          else removeItemAttachment(viewer.itemId, attachmentId)
        }}
      />

      <AppBottomSheet
        visible={editingApplication}
        onClose={() => setEditingApplication(false)}
        snapPoints={['95%']}
        footerComponent={renderEditApplicationFooter}
      >
        <BottomSheetView style={styles.sheetContent}>
          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Tags da aplicação</Text>
            <TagMultiSelect
              selectedIds={draftTagsIds}
              availableTags={tagsCatalog.activeTags}
              allTagsById={tagsCatalog.tagsById}
              onChange={setDraftTagsIds}
              onCreateTag={tagsCatalog.createTag}
            />
          </View>

          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Data da visita</Text>
            <DatePickerField value={draftDate} onChange={setDraftDate} />
          </View>

          {applicationError ? (
            <Text style={styles.modalError}>{applicationError}</Text>
          ) : null}
        </BottomSheetView>
      </AppBottomSheet>

      <AppBottomSheet
        visible={addingItem}
        onClose={() => setAddingItem(false)}
        snapPoints={['95%']}
        footerComponent={renderAddItemFooter}
      >
        <BottomSheetView style={styles.sheetContent}>
          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Título do item</Text>
            <Input
              placeholder="Ex.: Base de shaft 5"
              value={newItemTitle}
              onChangeValue={(value) => setNewItemTitle(String(value))}
            />
          </View>

          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Tags do item</Text>
            <TagMultiSelect
              selectedIds={newItemTagsIds}
              availableTags={tagsCatalog.activeTags}
              allTagsById={tagsCatalog.tagsById}
              onChange={setNewItemTagsIds}
              onCreateTag={tagsCatalog.createTag}
            />
          </View>

          {newItemError ? (
            <Text style={styles.modalError}>{newItemError}</Text>
          ) : null}
        </BottomSheetView>
      </AppBottomSheet>
      <ConfirmBottomSheet
        visible={deleteConfirmationVisible}
        title={`Excluir esta aplicação de "${checklist.title}"?`}
        message={`${progress.answered} de ${progress.total} itens respondidos e todas as fotos anexadas serão excluídos.`}
        confirmLabel="Excluir aplicação"
        confirming={deleting}
        onCancel={() => setDeleteConfirmationVisible(false)}
        onConfirm={confirmDelete}
      />
    </Screen>
  )
}
