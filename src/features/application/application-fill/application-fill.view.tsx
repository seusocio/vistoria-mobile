import { Pressable, Text, View } from 'react-native'
import { ScrollViewContainer } from 'react-native-reorderable-list'
import {
  Badge,
  PhotoViewer,
  FloatingAction,
  ProgressBar,
  Screen,
  TagChipList,
  VoiceCard,
} from '@/components'
import { Icon } from '@/components/Icon'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import { colors } from '@/styles'
import { presentApplicationCompletionPicker } from './application-completion-picker'
import { styles } from './application-fill.styles'
import {
  useApplicationFillContainer,
  type UseApplicationFillContainerProps,
} from './application-fill.container'
import { AddItemSheet } from './components/AddItemSheet'
import { ApplicationGallery } from './components/ApplicationGallery'
import { ApplicationItemDrawer } from './components/ApplicationItemDrawer'
import { ApplicationItemGroups } from './components/ApplicationItemGroups'
import { DeleteApplicationConfirm } from './components/DeleteApplicationConfirm'
import { EditApplicationSheet } from './components/EditApplicationSheet'
import { DERIVED_STATE_LABEL } from './derived-state-label'

/**
 * The only component in this feature — it calls useApplicationFillContainer
 * directly and renders from its return value. No separate container
 * component, no props interface mirroring the hook's internals by hand.
 */
export function ApplicationFillView(props: UseApplicationFillContainerProps) {
  const c = useApplicationFillContainer(props)

  if (c.loading) {
    return (
      <Screen loading variant="nested" onBack={c.onBack} title="Preenchimento" />
    )
  }

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
          label="Continuar"
          icon="chevron-down"
          iconPosition="trailing"
          onPress={() =>
            presentApplicationCompletionPicker((action) => {
              if (action === 'draft') c.onSaveDraft()
              else c.onComplete()
            })
          }
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
          {c.progress.done}/{c.progress.total} concluídos · {DERIVED_STATE_LABEL[c.derivedState]}
        </Text>
        {c.applicationError ? <Text style={styles.modalError}>{c.applicationError}</Text> : null}
        <ProgressBar progress={c.progress.total > 0 ? c.progress.done / c.progress.total : 0} />
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
          transcript={c.lastVoiceTranscript}
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

      <ApplicationItemGroups c={c} style={styles.groupsList} />

      <ApplicationItemDrawer c={c} />

      <PhotoViewer
        visible={c.viewer !== null}
        photos={c.viewerPhotos}
        initialIndex={c.viewer?.index ?? 0}
        onClose={c.onCloseViewer}
        onDelete={c.onDeletePhotoFromViewer}
      />

      <EditApplicationSheet c={c} />

      <AddItemSheet c={c} />

      <DeleteApplicationConfirm c={c} />
    </Screen>
  )
}
