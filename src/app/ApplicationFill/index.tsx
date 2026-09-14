import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  Badge,
  ConfirmBottomSheet,
  Input,
  ItemCard,
  ItemDrawer,
  ModalComponent,
  PhotoThumb,
  ProgressBar,
  Screen,
  TagChip,
  TagMultiSelect,
  VoiceCard,
} from '@/components'
import { Icon } from '@/components/Icon'
import { VoiceState } from '@/components/VoiceCard'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import { useApplicationFill } from '@/hooks/useApplicationFill'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import {
  acceptSuggestion,
  addApplicationAttachment,
  addApplicationItem,
  addAttachment,
  completeApplication,
  generateSuggestions,
  getDerivedState,
  getProgress,
  rejectSuggestion,
  removeApplication,
  removeApplicationAttachment,
  removeAttachment,
  setTranscript,
  simulateStopRecording,
  updateApplicationDate,
  updateApplicationItem,
  updateApplicationTags,
} from '@/infra/services'
import { StackRoutesProps } from '@/routes/types'
import { colors } from '@/styles'
import { formatBrDate, shiftDateIso } from '@/utils/date'
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
  const { checklist, application, setApplication, loading } =
    useApplicationFill(checklistId, applicationId)
  const tagsCatalog = useTagsCatalog()

  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [voiceExpanded, setVoiceExpanded] = useState(false)
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
  useEffect(() => {
    if (!FEATURE_FLAG.suggestion || !application) return
    setVoiceState(application.transcript ? 'ready' : 'idle')
    setVoiceExpanded(Boolean(application.transcript))
  }, [application?.id, application?.transcript])

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
        <></>
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

  async function handleAddPhoto(itemId: string) {
    await refresh(() =>
      addAttachment(application!, itemId, `Foto ${Date.now()}`),
    )
  }

  async function handleRemoveAttachment(itemId: string, attachmentId: string) {
    await refresh(() => removeAttachment(application!, itemId, attachmentId))
  }

  async function handleAddApplicationPhoto() {
    await refresh(() =>
      addApplicationAttachment(application!, `Foto ${Date.now()}`),
    )
  }

  async function handleRemoveApplicationAttachment(attachmentId: string) {
    await refresh(() => removeApplicationAttachment(application!, attachmentId))
  }

  async function handleStopRecording() {
    if (!FEATURE_FLAG.suggestion) return
    setVoiceState('processing')
    const transcript = await simulateStopRecording()
    await refresh(() => setTranscript(application!, transcript))
    setVoiceState('ready')
    setVoiceExpanded(true)
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
            onPress={handleDelete}
            accessibilityLabel="Excluir aplicação"
          >
            <Icon name="trash-2" size={16} color={colors.danger.base} />
          </Pressable>
        </View>
      }
      footer={
        <View style={styles.footerActions}>
          a
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
                onRemove={() =>
                  handleRemoveApplicationAttachment(attachment.id)
                }
              />
            ))}
        </View>
      </View>

      {FEATURE_FLAG.suggestion && (
        <VoiceCard
          state={voiceState}
          transcript={application.transcript}
          expanded={voiceExpanded}
          onToggleExpanded={() => setVoiceExpanded((prev) => !prev)}
          onStart={() => setVoiceState('recording')}
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

      <ModalComponent
        visible={editingApplication}
        onClose={() => setEditingApplication(false)}
        title="Editar aplicação"
        footer={
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
        }
      >
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
          <View style={styles.dateStepper}>
            <Pressable
              style={({ pressed }) => [
                styles.dateStepperButton,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => setDraftDate((prev) => shiftDateIso(prev, -1))}
              accessibilityLabel="Dia anterior"
            >
              <Icon name="chevron-left" size={16} color={colors.ink.base} />
            </Pressable>
            <View style={styles.dateStepperValueWrap}>
              <Icon name="calendar" size={16} color={colors.gray[400]} />
              <Text style={styles.dateStepperValue}>
                {formatBrDate(draftDate)}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.dateStepperButton,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => setDraftDate((prev) => shiftDateIso(prev, 1))}
              accessibilityLabel="Próximo dia"
            >
              <Icon name="chevron-right" size={16} color={colors.ink.base} />
            </Pressable>
          </View>
        </View>

        {applicationError && (
          <Text style={styles.modalError}>{applicationError}</Text>
        )}
      </ModalComponent>

      <ModalComponent
        visible={addingItem}
        onClose={() => setAddingItem(false)}
        title="Adicionar item"
        footer={
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
        }
      >
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

        {newItemError && <Text style={styles.modalError}>{newItemError}</Text>}
      </ModalComponent>
      <ConfirmBottomSheet
        visible={deleteConfirmationVisible}
        title="Excluir aplicação"
        message="Tem certeza que deseja excluir esta aplicação?"
        confirming={deleting}
        onCancel={() => setDeleteConfirmationVisible(false)}
        onConfirm={confirmDelete}
      />
    </Screen>
  )
}
