import { BottomSheetView } from '@gorhom/bottom-sheet'
import type { UseFormReturn } from 'react-hook-form'
import { Pressable, Text, View } from 'react-native'
import { ScrollViewContainer } from 'react-native-reorderable-list'
import {
  AppBottomSheet,
  Badge,
  ConfirmBottomSheet,
  Form,
  ItemDrawer,
  PhotoViewer,
  ProgressBar,
  Screen,
  TagChipList,
  VoiceCard,
} from '@/components'
import { Icon } from '@/components/Icon'
import type { ItemCompletionVariant } from '@/components/ItemCard'
import { useSheetFooterActions } from '@/components/SheetFooterActions'
import type { VoiceState } from '@/components/VoiceCard'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import type { useTagsCatalog } from '@/hooks/useTagsCatalog'
import type { Application, ApplicationItem, Checklist } from '@/infra/domain/entities'
import type {
  ApplicationItemDraftFormValues,
  ApplicationMetaFormValues,
  NewApplicationItemFormValues,
} from '@/infra/domain/schemas'
import type { ApplicationDerivedState } from '@/infra/services'
import { colors } from '@/styles'
import { styles } from './application-fill.styles'
import { ApplicationGallery } from './components/ApplicationGallery'
import { ApplicationItemGroupSection } from './components/ApplicationItemGroupSection'

const DERIVED_STATE_LABEL: Record<ApplicationDerivedState, string> = {
  not_started: 'Não iniciada',
  in_progress: 'Executando',
  completed: 'Completa',
}

interface ItemGroup {
  key: string
  title: string
  total: number
  answered: number
  children: ApplicationItem[]
}

export interface ApplicationFillViewProps {
  checklist: Checklist
  application: Application
  progress: { answered: number; total: number }
  derivedState: ApplicationDerivedState
  groups: ItemGroup[]
  resolveTagLabel: (item: ApplicationItem) => string | undefined
  applicationError: string | null
  tagsCatalog: ReturnType<typeof useTagsCatalog>
  uploadProgress: Record<string, number>

  voiceState: VoiceState
  generatingSuggestions: boolean
  onStartRecording: () => void
  onStopRecording: () => void
  onGenerateSuggestions: () => void

  viewer: { itemId: string | null; index: number } | null
  viewerPhotos: Array<{ id: string; uri?: string; uploading: boolean; progress: number }>
  onCloseViewer: () => void
  onDeletePhotoFromViewer: (attachmentId: string) => void

  onBack: () => void
  onDelete: () => void
  onComplete: () => void
  onEditApplication: () => void

  onAddApplicationPhoto: () => void
  onRemoveApplicationAttachment: (attachmentId: string) => void
  onRetryApplicationAttachment: (attachmentId: string) => void
  onOpenPhoto: (itemId: string | null, index: number) => void

  onOpenAddItem: () => void
  onToggleComplete: (itemId: string) => void
  onToggleGroupComplete: (itemIds: string[], complete: boolean) => void
  onOpenDrawer: (itemId: string) => void
  onAcceptSuggestion: (itemId: string) => void
  onRejectSuggestion: (itemId: string) => void
  onError: (message: string) => void

  editingItem: ApplicationItem | null
  editingItemIndex: number
  editingItemsTotal: number
  itemDraftValues: ApplicationItemDraftFormValues | null
  itemForm: UseFormReturn<ApplicationItemDraftFormValues>
  editingItemCompletionVariant: ItemCompletionVariant
  onCloseItemDrawer: () => void
  onSelectStatus: (itemId: string, status: ItemCompletionVariant) => void
  onAddPhoto: (itemId: string) => void
  onRemoveItemAttachment: (itemId: string, attachmentId: string) => void
  onRetryItemAttachment: (itemId: string, attachmentId: string) => void
  onSaveItemDrawer: () => void

  editingApplication: boolean
  metaForm: UseFormReturn<ApplicationMetaFormValues>
  onCloseEditApplication: () => void
  onSaveApplication: () => void

  addingItem: boolean
  newItemForm: UseFormReturn<NewApplicationItemFormValues>
  onCloseAddItem: () => void
  onSaveNewItem: () => void

  deleteConfirmationVisible: boolean
  onCancelDelete: () => void
  onConfirmDelete: () => void
}

export function ApplicationFillView({
  checklist,
  application,
  progress,
  derivedState,
  groups,
  resolveTagLabel,
  applicationError,
  tagsCatalog,
  uploadProgress,
  voiceState,
  generatingSuggestions,
  onStartRecording,
  onStopRecording,
  onGenerateSuggestions,
  viewer,
  viewerPhotos,
  onCloseViewer,
  onDeletePhotoFromViewer,
  onBack,
  onDelete,
  onComplete,
  onEditApplication,
  onAddApplicationPhoto,
  onRemoveApplicationAttachment,
  onRetryApplicationAttachment,
  onOpenPhoto,
  onOpenAddItem,
  onToggleComplete,
  onToggleGroupComplete,
  onOpenDrawer,
  onAcceptSuggestion,
  onRejectSuggestion,
  onError,
  editingItem,
  editingItemIndex,
  editingItemsTotal,
  itemDraftValues,
  itemForm,
  editingItemCompletionVariant,
  onCloseItemDrawer,
  onSelectStatus,
  onAddPhoto,
  onRemoveItemAttachment,
  onRetryItemAttachment,
  onSaveItemDrawer,
  editingApplication,
  metaForm,
  onCloseEditApplication,
  onSaveApplication,
  addingItem,
  newItemForm,
  onCloseAddItem,
  onSaveNewItem,
  deleteConfirmationVisible,
  onCancelDelete,
  onConfirmDelete,
}: ApplicationFillViewProps) {
  const renderEditApplicationFooter = useSheetFooterActions({
    confirmLabel: 'Salvar',
    onConfirm: onSaveApplication,
  })
  const renderAddItemFooter = useSheetFooterActions({
    confirmLabel: 'Adicionar',
    onConfirm: onSaveNewItem,
  })

  return (
    <Screen
      ScrollComponent={ScrollViewContainer}
      variant="nested"
      navTitleTone="muted"
      onBack={onBack}
      title={checklist.title}
      headerRight={
        <View style={styles.headerActions}>
          <Badge
            label={application.status === 'completed' ? 'Concluída' : 'Rascunho'}
            tone={application.status === 'completed' ? 'completed' : 'draft'}
          />
          <Pressable
            style={({ pressed }) => [styles.headerActionButton, pressed && { opacity: 0.7 }]}
            hitSlop={12}
            onPress={onDelete}
            accessibilityLabel="Excluir aplicação"
          >
            <Icon name="trash-2" size={16} color={colors.danger.base} />
          </Pressable>
        </View>
      }
      footer={
        <View style={styles.footerActions}>
          <Pressable
            style={({ pressed }) => [styles.completeButton, pressed && { opacity: 0.7 }]}
            onPress={onComplete}
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
          style={({ pressed }) => [styles.editAppButton, pressed && { opacity: 0.7 }]}
          hitSlop={12}
          onPress={onEditApplication}
          accessibilityLabel="Editar tags e data da aplicação"
        >
          <Icon name="edit-pen" size={12} color={colors.gray[600]} />
        </Pressable>
      </View>

      <View style={styles.progressCol}>
        <Text style={styles.progressText}>
          {progress.answered}/{progress.total} respondidos · {DERIVED_STATE_LABEL[derivedState]}
        </Text>
        {applicationError ? <Text style={styles.modalError}>{applicationError}</Text> : null}
        <ProgressBar progress={progress.total > 0 ? progress.answered / progress.total : 0} />
      </View>

      <View style={styles.gallerySection}>
        <View style={styles.galleryHeader}>
          <View>
            <Text style={styles.galleryTitle}>Galeria da aplicação</Text>
            <Text style={styles.gallerySubtitle}>
              {application.attachments.filter((attachment) => !attachment.deletedAt).length} anexadas
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addPhotoButton, pressed && { opacity: 0.7 }]}
            onPress={onAddApplicationPhoto}
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
          onRemoveAttachment={onRemoveApplicationAttachment}
          onRetryAttachment={onRetryApplicationAttachment}
          onOpenPhoto={(index) => onOpenPhoto(null, index)}
        />
      </View>

      {FEATURE_FLAG.voice && (
        <VoiceCard
          state={voiceState}
          transcript={application.transcript}
          onStart={onStartRecording}
          onStop={onStopRecording}
          onGenerateSuggestions={onGenerateSuggestions}
          generatingSuggestions={generatingSuggestions}
        />
      )}

      <View style={styles.itemsHeaderRow}>
        <Text style={styles.itemsTitle}>Itens do checklist</Text>
        <Pressable
          style={({ pressed }) => [styles.addItemButton, pressed && { opacity: 0.7 }]}
          onPress={onOpenAddItem}
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
            suggestionEnabled={FEATURE_FLAG.suggestion}
            resolveTagLabel={resolveTagLabel}
            onToggleComplete={onToggleComplete}
            onToggleGroupComplete={onToggleGroupComplete}
            onOpenDrawer={onOpenDrawer}
            onAcceptSuggestion={onAcceptSuggestion}
            onRejectSuggestion={onRejectSuggestion}
            onError={onError}
          />
        ))}
      </View>

      {editingItem && itemDraftValues && (
        <ItemDrawer
          visible={Boolean(editingItem)}
          onClose={onCloseItemDrawer}
          itemIndex={editingItemIndex + 1}
          itemsTotal={editingItemsTotal}
          title={editingItem.title}
          completionVariant={editingItemCompletionVariant}
          onSelectStatus={(status) => onSelectStatus(editingItem.id, status)}
          note={itemDraftValues.note}
          onNoteChange={(note) => itemForm.setValue('note', note, { shouldDirty: true })}
          tagsIds={itemDraftValues.tagsIds}
          availableTags={tagsCatalog.activeTags}
          allTagsById={tagsCatalog.tagsById}
          onChangeTags={(tagsIds) => itemForm.setValue('tagsIds', tagsIds, { shouldDirty: true })}
          onCreateTag={tagsCatalog.createTag}
          quantity={itemDraftValues.quantity}
          onQuantityChange={(quantity) =>
            itemForm.setValue('quantity', quantity, { shouldDirty: true })
          }
          attachments={editingItem.attachments}
          uploadProgress={uploadProgress}
          onAddPhoto={() => onAddPhoto(editingItem.id)}
          onRemoveAttachment={(attachmentId) => onRemoveItemAttachment(editingItem.id, attachmentId)}
          onRetryAttachment={(attachmentId) => onRetryItemAttachment(editingItem.id, attachmentId)}
          onOpenPhoto={(index) => onOpenPhoto(editingItem.id, index)}
          onSave={onSaveItemDrawer}
        />
      )}

      <PhotoViewer
        visible={viewer !== null}
        photos={viewerPhotos}
        initialIndex={viewer?.index ?? 0}
        onClose={onCloseViewer}
        onDelete={onDeletePhotoFromViewer}
      />

      <AppBottomSheet
        visible={editingApplication}
        onClose={onCloseEditApplication}
        snapPoints={['95%']}
        footerComponent={renderEditApplicationFooter}
      >
        <BottomSheetView style={styles.sheetContent}>
          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Tags da aplicação</Text>
            <Form.TagSelect
              control={metaForm.control}
              name="tagsIds"
              availableTags={tagsCatalog.activeTags}
              allTagsById={tagsCatalog.tagsById}
              onCreateTag={tagsCatalog.createTag}
            />
            <Form.ErrorText message={metaForm.formState.errors.tagsIds?.message} />
          </View>

          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Data da visita</Text>
            <Form.DateField control={metaForm.control} name="date" />
          </View>

          {applicationError ? <Text style={styles.modalError}>{applicationError}</Text> : null}
        </BottomSheetView>
      </AppBottomSheet>

      <AppBottomSheet
        visible={addingItem}
        onClose={onCloseAddItem}
        snapPoints={['95%']}
        footerComponent={renderAddItemFooter}
      >
        <BottomSheetView style={styles.sheetContent}>
          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Título do item</Text>
            <Form.TextField
              control={newItemForm.control}
              name="title"
              placeholder="Ex.: Base de shaft 5"
            />
          </View>

          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Tags do item</Text>
            <Form.TagSelect
              control={newItemForm.control}
              name="tagsIds"
              availableTags={tagsCatalog.activeTags}
              allTagsById={tagsCatalog.tagsById}
              onCreateTag={tagsCatalog.createTag}
            />
          </View>

          <Form.ErrorText message={newItemForm.formState.errors.root?.message} />
        </BottomSheetView>
      </AppBottomSheet>

      <ConfirmBottomSheet
        snapPoints={['30%']}
        visible={deleteConfirmationVisible}
        title={`Excluir esta aplicação de "${checklist.title}"?`}
        message={`${progress.answered} de ${progress.total} itens respondidos e todas as fotos anexadas serão excluídos.`}
        confirmLabel="Excluir aplicação"
        onCancel={onCancelDelete}
        onConfirm={onConfirmDelete}
      />
    </Screen>
  )
}
