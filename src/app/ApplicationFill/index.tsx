import { BottomSheetView } from '@gorhom/bottom-sheet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import {
  NestedReorderableList,
  reorderItems,
  ScrollViewContainer,
} from 'react-native-reorderable-list'
import {
  AppBottomSheet,
  Badge,
  ConfirmBottomSheet,
  DatePickerField,
  Input,
  ItemDrawer,
  ProgressBar,
  Screen,
  TagChipList,
  TagMultiSelect,
  VoiceCard,
  useUndoToast,
} from '@/components'
import { Icon } from '@/components/Icon'
import { ApplicationItemRow } from './components/ApplicationItemRow'
import { useSheetFooterActions } from '@/components/SheetFooterActions'
import { VoiceState } from '@/components/VoiceCard'
import { ApplicationGallery } from './components/ApplicationGallery'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import { useApplicationFill } from '@/hooks/useApplicationFill'
import { useApplicationMutations } from '@/hooks/useApplicationMutations'
import { useReorderablePanGesture } from '@/hooks/useReorderablePanGesture'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import {
  PhotoSource,
  PickedPhoto,
  generateUploadUrl,
  pickPhotos,
  prepareAsset,
} from '@/infra/convex'
import { generateId } from '@/infra/id'
import type { ApplicationItem } from '@/infra/domain/entities'
import {
  createAttachment,
  generateSuggestions,
  getDerivedState,
  getProgress,
  prepareTranscriber,
  reorderChecklistItems,
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
  const tagsCatalog = useTagsCatalog()
  const { startRecording, stopRecording } = useVoiceRecorder()
  const { show: showUndo } = useUndoToast()
  const uploadProgress = useUploadStore((state) => state.progress)

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
  const [optimisticItems, setOptimisticItems] = useState<ApplicationItem[] | null>(
    null,
  )
  const [reorderPending, setReorderPending] = useState(false)
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
  const sortedItems = useMemo(
    () =>
      applicationData && checklist
        ? sortItemsByChecklistOrder(applicationData.items, checklist)
        : [],
    [applicationData, checklist],
  )
  const derivedState = applicationData
    ? getDerivedState(applicationData)
    : 'not_started'
  const orderedItems = optimisticItems ?? sortedItems
  useEffect(() => {
    if (!optimisticItems) return
    const isSynced =
      optimisticItems.length === sortedItems.length &&
      optimisticItems.every(
        (item, index) => sortedItems[index]?.id === item.id,
      )
    if (isSynced) {
      setOptimisticItems(null)
      setReorderPending(false)
    } else if (!reorderPending) {
      setOptimisticItems(null)
    }
  }, [optimisticItems, reorderPending, sortedItems])
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
  const activeChecklist = checklist
  async function handleReorder({ from, to }: { from: number; to: number }) {
    if (from === to) return
    const movedItem = orderedItems[from]
    const targetItem = orderedItems[to]
    if (!movedItem?.checklistItemId || !targetItem?.checklistItemId) return
    const templateFrom = activeChecklist.items.findIndex(
      (item) => item.id === movedItem.checklistItemId,
    )
    const templateTo = activeChecklist.items.findIndex(
      (item) => item.id === targetItem.checklistItemId,
    )
    if (templateFrom < 0 || templateTo < 0) return

    const previousItems = orderedItems
    setOptimisticItems(reorderItems(previousItems, from, to))
    setReorderPending(true)
    try {
      await reorderChecklistItems(activeChecklist.id, templateFrom, templateTo)
    } catch {
      setOptimisticItems(previousItems)
      setReorderPending(false)
      setApplicationError('Não foi possível reordenar os itens')
    }
  }
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

  async function uploadAsset(asset: PickedPhoto, target: { itemId?: string }) {
    try {
      const uploadUrlPromise = generateUploadUrl()
      const prepared = await prepareAsset(asset)
      const uploadUrl = await uploadUrlPromise
      const item = target.itemId
        ? application.items.find((candidate) => candidate.id === target.itemId)
        : undefined
      const attachment = createAttachment(
        {
          id: generateId('attachment_'),
          name: prepared.fileName ?? `Foto ${Date.now()}`,
          uploadStatus: 'pending',
          mimeType: prepared.mimeType,
          width: prepared.width,
          height: prepared.height,
        },
        item?.attachments.length ?? application.attachments.length,
        new Date().toISOString(),
      )
      const updatedAt = new Date().toISOString()
      void mutations
        .addAttachment({
          applicationId: application.id,
          itemId: target.itemId ?? null,
          attachment,
          updatedAt,
        })
        .then(() => {
          useUploadStore.getState().enqueue({
            applicationId: application.id,
            itemId: target.itemId ?? null,
            attachment,
            uploadUrl,
          })
        })
        .catch(() => setApplicationError('Não foi possível adicionar a foto'))
    } catch (error) {
      setApplicationError(
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar a foto',
      )
    }
  }

  async function attachPhotos(
    source: PhotoSource,
    target: { itemId?: string },
  ) {
    const assets = await pickPhotos(source)
    if (assets.length === 0) return
    await Promise.all(assets.map((asset) => uploadAsset(asset, target)))
  }

  function choosePhoto(target: { itemId?: string }) {
    Alert.alert('Adicionar foto', 'Escolha a origem da imagem.', [
      { text: 'Câmera', onPress: () => void attachPhotos('camera', target) },
      { text: 'Biblioteca', onPress: () => void attachPhotos('library', target) },
      { text: 'Cancelar', style: 'cancel' },
    ])
  }

  function handleAddPhoto(itemId: string) {
    choosePhoto({ itemId })
  }

  function handleAddApplicationPhoto() {
    choosePhoto({})
  }

  function handleRemoveAttachment(itemId: string, attachmentId: string) {
    const deletedAt = new Date().toISOString()
    void mutations
      .setAttachmentDeletedAt({
        applicationId: application.id,
        itemId,
        attachmentId,
        deletedAt,
        updatedAt: deletedAt,
      })
      .catch(() => setApplicationError('Não foi possível remover a foto'))
    showUndo({
      message: 'Foto removida',
      onCommit: () => undefined,
      onUndo: () => {
        const updatedAt = new Date().toISOString()
        void mutations
          .setAttachmentDeletedAt({
            applicationId: application.id,
            itemId,
            attachmentId,
            deletedAt: null,
            updatedAt,
          })
          .catch(() => setApplicationError('Não foi possível desfazer'))
      },
    })
  }

  function handleRemoveApplicationAttachment(attachmentId: string) {
    const deletedAt = new Date().toISOString()
    void mutations
      .setAttachmentDeletedAt({
        applicationId: application.id,
        itemId: null,
        attachmentId,
        deletedAt,
        updatedAt: deletedAt,
      })
      .catch(() => setApplicationError('Não foi possível remover a foto'))
    showUndo({
      message: 'Foto removida',
      onCommit: () => undefined,
      onUndo: () => {
        const updatedAt = new Date().toISOString()
        void mutations
          .setAttachmentDeletedAt({
            applicationId: application.id,
            itemId: null,
            attachmentId,
            deletedAt: null,
            updatedAt,
          })
          .catch(() => setApplicationError('Não foi possível desfazer'))
      },
    })
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
    const item = orderedItems.find((candidate) => candidate.id === itemId)
    if (!item) return
    setEditingItemDraft({
      note: item.note,
      tagsIds: [...item.tagsIds],
      quantity: item.quantity,
    })
    setEditingItemId(itemId)
  }

  const editingItem = editingItemId
    ? orderedItems.find((item) => item.id === editingItemId)
    : null
  const editingItemIndex = editingItem
    ? orderedItems.indexOf(editingItem)
    : -1
  const itemDraft = editingItem && editingItemDraft
    ? editingItemDraft
    : editingItem
      ? { note: editingItem.note, tagsIds: editingItem.tagsIds, quantity: editingItem.quantity }
      : null


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
          onRemoveAttachment={handleRemoveApplicationAttachment}
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

      <NestedReorderableList
        data={orderedItems}
        scrollable={false}
        scrollEnabled={false}
        contentContainerStyle={styles.itemsList}
        panGesture={panGesture}
        keyExtractor={(item) => item.id}
        onReorder={handleReorder}
        renderItem={({ item }) => (
          <ApplicationItemRow
            item={item}
            canDrag={Boolean(item.checklistItemId)}
            options={checklist.options}
            tagLabel={tagsCatalog.resolveLabels(item.tagsIds)[0]}
            suggestionEnabled={FEATURE_FLAG.suggestion}
            onAnswerChange={handleAnswerChange}
            onOpenDrawer={handleOpenItemDrawer}
            onAcceptSuggestion={handleAcceptSuggestion}
            onRejectSuggestion={handleRejectSuggestion}
          />
        )}
      />

      {editingItem && (
        <ItemDrawer
          visible={Boolean(editingItem)}
          onClose={() => {
            setEditingItemId(null)
            setEditingItemDraft(null)
          }}
          itemIndex={editingItemIndex + 1}
          itemsTotal={orderedItems.length}
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
          pendingPhotos={editingItem.attachments
            .filter((attachment) => attachment.uploadStatus === 'pending' && !attachment.deletedAt && attachment.localUri)
            .map((attachment) => ({
              id: attachment.id,
              uri: attachment.localUri as string,
              progress: uploadProgress[attachment.id] ?? 0,
            }))}
          onAddPhoto={() => handleAddPhoto(editingItem.id)}
          onRemoveAttachment={(attachmentId) =>
            handleRemoveAttachment(editingItem.id, attachmentId)
          }
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
