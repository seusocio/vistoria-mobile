import { BottomSheetView } from '@gorhom/bottom-sheet'
import { Pressable, Text, View } from 'react-native'
import { ScrollViewContainer } from 'react-native-reorderable-list'
import {
  AppBottomSheet,
  Badge,
  ConfirmBottomSheet,
  Form,
  ItemDrawer,
  PhotoViewer,
  FloatingAction,
  ProgressBar,
  Screen,
  TagChipList,
  VoiceCard,
} from '@/components'
import { Icon } from '@/components/Icon'
import { useSheetFooterActions } from '@/components/SheetFooterActions'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import type { ApplicationDerivedState } from '@/features/application/shared/application.utils'
import { colors } from '@/styles'
import { styles } from './application-fill.styles'
import {
  useApplicationFillContainer,
  type UseApplicationFillContainerProps,
} from './application-fill.container'
import { ApplicationGallery } from './components/ApplicationGallery'
import { ApplicationItemGroupSection } from './components/ApplicationItemGroupSection'

const DERIVED_STATE_LABEL: Record<ApplicationDerivedState, string> = {
  not_started: 'Não iniciada',
  in_progress: 'Executando',
  completed: 'Completa',
}

/**
 * The only component in this feature — it calls useApplicationFillContainer
 * directly and renders from its return value. No separate container
 * component, no props interface mirroring the hook's internals by hand.
 */
export function ApplicationFillView(props: UseApplicationFillContainerProps) {
  const c = useApplicationFillContainer(props)

  const renderEditApplicationFooter = useSheetFooterActions({
    confirmLabel: 'Salvar',
    onConfirm: c.onSaveApplication,
  })
  const renderAddItemFooter = useSheetFooterActions({
    confirmLabel: 'Adicionar',
    onConfirm: c.onSaveNewItem,
  })

  if (c.loading) {
    return (
      <Screen loading variant="nested" onBack={c.onBack} title="Preenchimento" />
    )
  }

  // Pulled into local consts so TS narrows them through the inline callbacks
  // below (`c.editingItem`, a property access, doesn't narrow across a
  // closure boundary the way a const binding does).
  const editingItem = c.editingItem
  const itemDraftValues = c.itemDraftValues

  return (
    <Screen
      ScrollComponent={ScrollViewContainer}
      variant="nested"
      navTitleTone="muted"
      onBack={c.onBack}
      title={c.checklist.title}
      headerRight={
        <View style={styles.headerActions}>
          <Badge
            label={c.application.status === 'completed' ? 'Concluída' : 'Rascunho'}
            tone={c.application.status === 'completed' ? 'completed' : 'draft'}
          />
          <Pressable
            style={({ pressed }) => [styles.headerActionButton, pressed && { opacity: 0.7 }]}
            hitSlop={12}
            onPress={c.onDelete}
            accessibilityLabel="Excluir aplicação"
          >
            <Icon name="trash-2" size={16} color={colors.danger.base} />
          </Pressable>
        </View>
      }
      footer={
        <FloatingAction
          label="Concluir aplicação"
          icon="check"
          onPress={c.onComplete}
        />
      }
    >
      <View style={styles.tagsRow}>
        <TagChipList labels={c.tagsCatalog.resolveLabels(c.application.tagsIds)} />
        <Pressable
          style={({ pressed }) => [styles.editAppButton, pressed && { opacity: 0.7 }]}
          hitSlop={12}
          onPress={c.onEditApplication}
          accessibilityLabel="Editar tags e data da aplicação"
        >
          <Icon name="edit-pen" size={12} color={colors.gray[600]} />
        </Pressable>
      </View>

      <View style={styles.progressCol}>
        <Text style={styles.progressText}>
          {c.progress.answered}/{c.progress.total} respondidos · {DERIVED_STATE_LABEL[c.derivedState]}
        </Text>
        {c.applicationError ? <Text style={styles.modalError}>{c.applicationError}</Text> : null}
        <ProgressBar progress={c.progress.total > 0 ? c.progress.answered / c.progress.total : 0} />
      </View>

      <View style={styles.gallerySection}>
        <View style={styles.galleryHeader}>
          <View>
            <Text style={styles.galleryTitle}>Galeria da aplicação</Text>
            <Text style={styles.gallerySubtitle}>
              {c.application.attachments.filter((attachment) => !attachment.deletedAt).length} anexadas
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addPhotoButton, pressed && { opacity: 0.7 }]}
            onPress={c.onAddApplicationPhoto}
          >
            <Icon name="camera" size={16} color={colors.blue.base} />
            <Text style={styles.addPhotoButtonText}>Adicionar</Text>
          </Pressable>
        </View>
        {c.application.gallerySourceApplicationId ? (
          <Text style={styles.galleryReference}>
            Galeria da aplicação anterior disponível como referência.
          </Text>
        ) : null}
        <ApplicationGallery
          attachments={c.application.attachments}
          uploadProgress={c.uploadProgress}
          onRemoveAttachment={c.onRemoveApplicationAttachment}
          onRetryAttachment={c.onRetryApplicationAttachment}
          onOpenPhoto={(index) => c.onOpenPhoto(null, index)}
        />
      </View>

      {FEATURE_FLAG.voice && (
        <VoiceCard
          state={c.voiceState}
          transcript={c.application.transcript}
          onStart={c.onStartRecording}
          onStop={c.onStopRecording}
          onGenerateSuggestions={c.onGenerateSuggestions}
          generatingSuggestions={c.generatingSuggestions}
        />
      )}

      <View style={styles.itemsHeaderRow}>
        <Text style={styles.itemsTitle}>Itens do checklist</Text>
        <Pressable
          style={({ pressed }) => [styles.addItemButton, pressed && { opacity: 0.7 }]}
          onPress={c.onOpenAddItem}
          accessibilityLabel="Adicionar item avulso"
        >
          <Icon name="plus" size={14} color={colors.blue.base} />
          <Text style={styles.addItemButtonText}>Adicionar item</Text>
        </Pressable>
      </View>

      <View style={styles.groupsList}>
        {c.groups.map((group) => (
          <ApplicationItemGroupSection
            key={group.key}
            title={group.title}
            groupItems={group.children}
            total={group.total}
            answered={group.answered}
            checklist={c.checklist}
            suggestionEnabled={FEATURE_FLAG.suggestion}
            resolveTagLabel={c.resolveTagLabel}
            onToggleComplete={c.onToggleComplete}
            onToggleGroupComplete={c.onToggleGroupComplete}
            onOpenDrawer={c.onOpenDrawer}
            onAcceptSuggestion={c.onAcceptSuggestion}
            onRejectSuggestion={c.onRejectSuggestion}
          />
        ))}
      </View>

      {editingItem && itemDraftValues && (
        <ItemDrawer
          visible
          onClose={c.onCloseItemDrawer}
          itemIndex={c.editingItemIndex + 1}
          itemsTotal={c.editingItemsTotal}
          title={editingItem.title}
          completionVariant={c.editingItemCompletionVariant}
          onSelectStatus={(status) => c.onSelectStatus(editingItem.id, status)}
          note={itemDraftValues.note}
          onNoteChange={(note) => c.itemForm.setValue('note', note, { shouldDirty: true })}
          tagsIds={itemDraftValues.tagsIds}
          availableTags={c.tagsCatalog.activeTags}
          allTagsById={c.tagsCatalog.tagsById}
          onChangeTags={(tagsIds) => c.itemForm.setValue('tagsIds', tagsIds, { shouldDirty: true })}
          onCreateTag={c.tagsCatalog.createTag}
          quantity={itemDraftValues.quantity}
          onQuantityChange={(quantity) =>
            c.itemForm.setValue('quantity', quantity, { shouldDirty: true })
          }
          attachments={editingItem.attachments}
          uploadProgress={c.uploadProgress}
          onAddPhoto={() => c.onAddPhoto(editingItem.id)}
          onRemoveAttachment={(attachmentId) => c.onRemoveItemAttachment(editingItem.id, attachmentId)}
          onRetryAttachment={(attachmentId) => c.onRetryItemAttachment(editingItem.id, attachmentId)}
          onOpenPhoto={(index) => c.onOpenPhoto(editingItem.id, index)}
          onSave={c.onSaveItemDrawer}
        />
      )}

      <PhotoViewer
        visible={c.viewer !== null}
        photos={c.viewerPhotos}
        initialIndex={c.viewer?.index ?? 0}
        onClose={c.onCloseViewer}
        onDelete={c.onDeletePhotoFromViewer}
      />

      <AppBottomSheet
        visible={c.editingApplication}
        onClose={c.onCloseEditApplication}
        snapPoints={['95%']}
        footerComponent={renderEditApplicationFooter}
      >
        <BottomSheetView style={styles.sheetContent}>
          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Tags da aplicação</Text>
            <Form.TagSelect
              control={c.metaForm.control}
              name="tagsIds"
              availableTags={c.tagsCatalog.activeTags}
              allTagsById={c.tagsCatalog.tagsById}
              onCreateTag={c.tagsCatalog.createTag}
            />
            <Form.ErrorText message={c.metaForm.formState.errors.tagsIds?.message} />
          </View>

          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Data da visita</Text>
            <Form.DateField control={c.metaForm.control} name="date" />
          </View>

          {c.applicationError ? <Text style={styles.modalError}>{c.applicationError}</Text> : null}
        </BottomSheetView>
      </AppBottomSheet>

      <AppBottomSheet
        visible={c.addingItem}
        onClose={c.onCloseAddItem}
        snapPoints={['95%']}
        footerComponent={renderAddItemFooter}
      >
        <BottomSheetView style={styles.sheetContent}>
          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Título do item</Text>
            <Form.TextField
              control={c.newItemForm.control}
              name="title"
              placeholder="Ex.: Base de shaft 5"
            />
          </View>

          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Tags do item</Text>
            <Form.TagSelect
              control={c.newItemForm.control}
              name="tagsIds"
              availableTags={c.tagsCatalog.activeTags}
              allTagsById={c.tagsCatalog.tagsById}
              onCreateTag={c.tagsCatalog.createTag}
            />
          </View>

          <Form.ErrorText message={c.newItemForm.formState.errors.root?.message} />
        </BottomSheetView>
      </AppBottomSheet>

      <ConfirmBottomSheet
        snapPoints={['30%']}
        visible={c.deleteConfirmationVisible}
        title={`Excluir esta aplicação de "${c.checklist.title}"?`}
        message={`${c.progress.answered} de ${c.progress.total} itens respondidos e todas as fotos anexadas serão excluídos.`}
        confirmLabel="Excluir aplicação"
        onCancel={c.onCancelDelete}
        onConfirm={c.onConfirmDelete}
      />
    </Screen>
  )
}
