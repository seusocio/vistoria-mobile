import {
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetView,
} from '@gorhom/bottom-sheet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import {
  AppBottomSheet,
  Badge,
  ConfirmBottomSheet,
  DatePickerField,
  Input,
  ItemCard,
  ItemDrawer,
  PhotoThumb,
  ProgressBar,
  Screen,
  TagChip,
  TagMultiSelect,
  VoiceCard,
  useUndoToast,
} from '@/components'
import { Icon } from '@/components/Icon'
import { VoiceState } from '@/components/VoiceCard'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import { useApplicationFill } from '@/hooks/useApplicationFill'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import {
  PhotoSource,
  PickedPhoto,
  pickPhotos,
  uploadImage,
} from '@/infra/convex'
import type { AttachmentInput } from '@/infra/services'
import {
  acceptSuggestion,
  addApplicationAttachment,
  addApplicationItem,
  addAttachment,
  completeApplication,
  generateSuggestions,
  getDerivedState,
  getProgress,
  prepareTranscriber,
  rejectSuggestion,
  removeApplication,
  removeApplicationAttachment,
  removeAttachment,
  setTranscript,
  transcribeAudio,
  updateApplicationDate,
  updateApplicationItem,
  updateApplicationTags,
} from '@/infra/services'
import { StackRoutesProps } from '@/routes/types'
import { colors } from '@/styles'
import { haptics } from '@/utils/haptics'
import { styles } from './styles'

interface PendingUpload {
  id: string
  uri: string
  itemId?: string
  progress: number
}

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
  const { checklist, application, setApplication, loading } =
    useApplicationFill(checklistId, applicationId)
  const tagsCatalog = useTagsCatalog()
  const { startRecording, stopRecording } = useVoiceRecorder()
  const { show: showUndo } = useUndoToast()

  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
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
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])
  const latestApplication = useRef(application)
  const uploadQueue = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => {
    latestApplication.current = application
  }, [application])
  const currentApplicationId = application?.id
  const currentTranscript = application?.transcript
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

  const progress = useMemo(
    () => (application ? getProgress(application) : { answered: 0, total: 0 }),
    [application],
  )
  const derivedState = application
    ? getDerivedState(application)
    : 'not_started'

  if (loading || !checklist || !application) {
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

  async function refresh(updater: () => Promise<typeof application>) {
    const updated = await updater()
    setApplication(updated)
  }

  async function handleAnswerChange(itemId: string, answer: string) {
    await refresh(() =>
      updateApplicationItem(application!, itemId, { answer, suggested: false }),
    )
  }

  function enqueueAttachment(input: AttachmentInput, itemId?: string) {
    uploadQueue.current = uploadQueue.current.then(async () => {
      const base = latestApplication.current
      if (!base) return
      const updated = itemId
        ? await addAttachment(base, itemId, input)
        : await addApplicationAttachment(base, input)
      latestApplication.current = updated
      setApplication(updated)
    })
    return uploadQueue.current
  }

  async function uploadAsset(asset: PickedPhoto, target: { itemId?: string }) {
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`
    setPendingUploads((prev) => [
      ...prev,
      { id: uploadId, uri: asset.uri, itemId: target.itemId, progress: 0 },
    ])
    try {
      const storageId = await uploadImage(
        asset.uri,
        asset.mimeType,
        (fraction) =>
          setPendingUploads((prev) =>
            prev.map((upload) =>
              upload.id === uploadId
                ? { ...upload, progress: fraction }
                : upload,
            ),
          ),
      )
      await enqueueAttachment(
        {
          name: asset.fileName ?? `Foto ${Date.now()}`,
          storageId,
          mimeType: asset.mimeType,
          width: asset.width,
          height: asset.height,
        },
        target.itemId,
      )
    } catch (error) {
      setApplicationError(
        error instanceof Error
          ? error.message
          : 'Não foi possível adicionar a foto',
      )
    } finally {
      setPendingUploads((prev) =>
        prev.filter((upload) => upload.id !== uploadId),
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
      {
        text: 'Câmera',
        onPress: () => void attachPhotos('camera', target),
      },
      {
        text: 'Biblioteca',
        onPress: () => void attachPhotos('library', target),
      },
      { text: 'Cancelar', style: 'cancel' },
    ])
  }

  function handleAddPhoto(itemId: string) {
    choosePhoto({ itemId })
  }

  function handleAddApplicationPhoto() {
    choosePhoto({})
  }

  function setItemAttachmentDeletedAt(
    itemId: string,
    attachmentId: string,
    deletedAt: string | null,
  ) {
    setApplication((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    attachments: item.attachments.map((attachment) =>
                      attachment.id === attachmentId
                        ? { ...attachment, deletedAt }
                        : attachment,
                    ),
                  }
                : item,
            ),
          }
        : current,
    )
  }

  function setApplicationAttachmentDeletedAt(
    attachmentId: string,
    deletedAt: string | null,
  ) {
    setApplication((current) =>
      current
        ? {
            ...current,
            attachments: current.attachments.map((attachment) =>
              attachment.id === attachmentId
                ? { ...attachment, deletedAt }
                : attachment,
            ),
          }
        : current,
    )
  }

  function handleRemoveAttachment(itemId: string, attachmentId: string) {
    setItemAttachmentDeletedAt(itemId, attachmentId, new Date().toISOString())
    showUndo({
      message: 'Foto removida',
      onCommit: () => {
        const current = latestApplication.current
        if (!current) return
        void removeAttachment(current, itemId, attachmentId)
          .then(setApplication)
          .catch(() => {
            setItemAttachmentDeletedAt(itemId, attachmentId, null)
            setApplicationError('Não foi possível remover a foto')
          })
      },
      onUndo: () => setItemAttachmentDeletedAt(itemId, attachmentId, null),
    })
  }

  function handleRemoveApplicationAttachment(attachmentId: string) {
    setApplicationAttachmentDeletedAt(attachmentId, new Date().toISOString())
    showUndo({
      message: 'Foto removida',
      onCommit: () => {
        const current = latestApplication.current
        if (!current) return
        void removeApplicationAttachment(current, attachmentId)
          .then(setApplication)
          .catch(() => {
            setApplicationAttachmentDeletedAt(attachmentId, null)
            setApplicationError('Não foi possível remover a foto')
          })
      },
      onUndo: () => setApplicationAttachmentDeletedAt(attachmentId, null),
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
      await refresh(() => setTranscript(application!, transcript))
      setVoiceState('ready')
    } catch (error) {
      setApplicationError(
        error instanceof Error
          ? error.message
          : 'Não foi possível transcrever a gravação',
      )
      setVoiceState(application?.transcript ? 'ready' : 'idle')
    }
  }

  async function handleGenerateSuggestions() {
    if (!FEATURE_FLAG.suggestion) return
    setGeneratingSuggestions(true)
    try {
      const suggestions = await generateSuggestions(checklist!, application!)
      let current = application!
      for (const suggestion of suggestions) {
        current = await updateApplicationItem(current, suggestion.itemId, {
          answer: suggestion.answer,
          note: suggestion.note ?? '',
          suggested: true,
          suggestionSource: 'transcript',
        })
      }
      setApplication(current)
    } finally {
      setGeneratingSuggestions(false)
    }
  }

  async function handleAcceptSuggestion(itemId: string) {
    if (!FEATURE_FLAG.suggestion) return
    await refresh(() => acceptSuggestion(application!, itemId))
  }

  async function handleRejectSuggestion(itemId: string) {
    if (!FEATURE_FLAG.suggestion) return
    await refresh(() => rejectSuggestion(application!, itemId))
  }

  async function handleComplete() {
    await refresh(() => completeApplication(application!))
    haptics.success()
    navigation.navigate('checklistDetail', { checklistId })
  }

  function handleDelete() {
    setDeleteConfirmationVisible(true)
  }

  async function confirmDelete() {
    if (deleting) return
    setDeleting(true)
    try {
      await removeApplication(application!.id)
      setDeleteConfirmationVisible(false)
      navigation.replace('checklistDetail', { checklistId })
    } finally {
      setDeleting(false)
    }
  }

  function handleOpenEditApplication() {
    setDraftTagsIds(application!.tagsIds)
    setDraftDate(application!.date)
    setApplicationError(null)
    setEditingApplication(true)
  }

  async function handleSaveApplication() {
    if (draftTagsIds.length === 0) {
      haptics.error()
      setApplicationError('Selecione ao menos uma tag')
      return
    }
    setApplicationError(null)
    let current = application!
    current = await updateApplicationTags(current, draftTagsIds)
    current = await updateApplicationDate(current, draftDate)
    setApplication(current)
    setEditingApplication(false)
  }

  function handleOpenAddItem() {
    setNewItemTitle('')
    setNewItemTagsIds([])
    setNewItemError(null)
    setAddingItem(true)
  }

  async function handleSaveNewItem() {
    if (!newItemTitle.trim()) {
      haptics.error()
      setNewItemError('Informe um título para o item')
      return
    }
    setNewItemError(null)
    await refresh(() =>
      addApplicationItem(application!, {
        title: newItemTitle,
        tagsIds: newItemTagsIds,
      }),
    )
    setAddingItem(false)
  }

  const editingItem = editingItemId
    ? application.items.find((item) => item.id === editingItemId)
    : null
  const editingItemIndex = editingItem
    ? application.items.indexOf(editingItem)
    : -1
  function renderEditApplicationFooter(props: BottomSheetFooterProps) {
    return (
      <BottomSheetFooter {...props} style={styles.sheetFooter}>
        <Pressable
          style={({ pressed }) => [
            styles.saveAppButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleSaveApplication}
        >
          <Icon name="check" size={16} color={colors.white} />
          <Text style={styles.saveAppButtonText}>Salvar</Text>
        </Pressable>
      </BottomSheetFooter>
    )
  }

  function renderAddItemFooter(props: BottomSheetFooterProps) {
    return (
      <BottomSheetFooter {...props} style={styles.sheetFooter}>
        <Pressable
          style={({ pressed }) => [
            styles.saveAppButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleSaveNewItem}
        >
          <Icon name="check" size={16} color={colors.white} />
          <Text style={styles.saveAppButtonText}>Adicionar</Text>
        </Pressable>
      </BottomSheetFooter>
    )
  }

  return (
    <Screen
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
        {tagsCatalog.resolveLabels(application.tagsIds).map((label) => (
          <TagChip key={label} label={label} />
        ))}
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
        <View style={styles.galleryPhotosRow}>
          {application.attachments
            .filter((attachment) => !attachment.deletedAt)
            .map((attachment) => (
              <PhotoThumb
                key={attachment.id}
                uri={attachment.url}
                onRemove={() =>
                  handleRemoveApplicationAttachment(attachment.id)
                }
              />
            ))}
          {pendingUploads
            .filter((upload) => !upload.itemId)
            .map((upload) => (
              <PhotoThumb
                key={upload.id}
                uri={upload.uri}
                uploading
                progress={upload.progress}
              />
            ))}
        </View>
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

      <View style={styles.itemsList}>
        {application.items.map((item) => (
          <ItemCard
            key={item.id}
            title={item.title}
            tagLabel={tagsCatalog.resolveLabels(item.tagsIds)[0]}
            hasNote={Boolean(item.note)}
            photosCount={item.attachments.filter((a) => !a.deletedAt).length}
            quantity={item.quantity}
            suggested={FEATURE_FLAG.suggestion && item.suggested}
            suggestionSource={
              FEATURE_FLAG.suggestion ? item.suggestionSource : null
            }
            options={checklist.options}
            answer={item.answer}
            onAnswerChange={(answer) => handleAnswerChange(item.id, answer)}
            onOpenDrawer={() => setEditingItemId(item.id)}
            onAcceptSuggestion={
              FEATURE_FLAG.suggestion
                ? () => handleAcceptSuggestion(item.id)
                : undefined
            }
            onRejectSuggestion={
              FEATURE_FLAG.suggestion
                ? () => handleRejectSuggestion(item.id)
                : undefined
            }
          />
        ))}
      </View>

      {editingItem && (
        <ItemDrawer
          visible={Boolean(editingItem)}
          onClose={() => setEditingItemId(null)}
          itemIndex={editingItemIndex + 1}
          itemsTotal={application.items.length}
          title={editingItem.title}
          note={editingItem.note}
          onNoteChange={(note) =>
            setApplication({
              ...application,
              items: application.items.map((i) =>
                i.id === editingItem.id ? { ...i, note } : i,
              ),
            })
          }
          tagsIds={editingItem.tagsIds}
          availableTags={tagsCatalog.activeTags}
          allTagsById={tagsCatalog.tagsById}
          onChangeTags={(ids) =>
            setApplication({
              ...application,
              items: application.items.map((i) =>
                i.id === editingItem.id ? { ...i, tagsIds: ids } : i,
              ),
            })
          }
          onCreateTag={tagsCatalog.createTag}
          quantity={editingItem.quantity}
          onQuantityChange={(quantity) =>
            setApplication({
              ...application,
              items: application.items.map((i) =>
                i.id === editingItem.id ? { ...i, quantity } : i,
              ),
            })
          }
          attachments={editingItem.attachments}
          pendingPhotos={pendingUploads
            .filter((upload) => upload.itemId === editingItem.id)
            .map((upload) => ({
              id: upload.id,
              uri: upload.uri,
              progress: upload.progress,
            }))}
          onAddPhoto={() => handleAddPhoto(editingItem.id)}
          onRemoveAttachment={(attachmentId) =>
            handleRemoveAttachment(editingItem.id, attachmentId)
          }
          onSave={async () => {
            await refresh(() =>
              updateApplicationItem(application, editingItem.id, {
                note: editingItem.note,
                tagsIds: editingItem.tagsIds,
                quantity: editingItem.quantity,
              }),
            )
            setEditingItemId(null)
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
