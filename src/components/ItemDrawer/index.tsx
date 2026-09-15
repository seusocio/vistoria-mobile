import {
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet'
import { Pressable, Text, View } from 'react-native'
import { Attachment, Tag } from '@/infra/domain/entities'
import { colors } from '@/styles'
import { AppBottomSheet } from '../AppBottomSheet'
import { Icon } from '../Icon'
import { AddPhotoButton, PhotoThumb } from '../PhotoThumb'
import { Stepper } from '../Stepper'
import { TagMultiSelect } from '../TagMultiSelect'
import { styles } from './styles'

export interface ItemDrawerProps {
  visible: boolean
  onClose: () => void
  itemIndex: number
  itemsTotal: number
  title: string
  note: string
  onNoteChange: (note: string) => void
  tagsIds: string[]
  availableTags: Tag[]
  allTagsById: Map<string, Tag>
  onChangeTags: (ids: string[]) => void
  onCreateTag: (label: string) => Promise<Tag>
  quantity: number | null
  onQuantityChange: (quantity: number | null) => void
  attachments: Attachment[]
  pendingPhotos?: { id: string; uri: string; progress: number }[]
  onAddPhoto: () => void
  onRemoveAttachment: (attachmentId: string) => void
  onSave: () => void
}

/** Component/ItemDrawer, shown as a gorhom bottom sheet (Screen/PreenchimentoComDrawer) */
export function ItemDrawer({
  visible,
  onClose,
  itemIndex,
  itemsTotal,
  title,
  note,
  onNoteChange,
  tagsIds,
  availableTags,
  allTagsById,
  onChangeTags,
  onCreateTag,
  quantity,
  onQuantityChange,
  attachments,
  pendingPhotos = [],
  onAddPhoto,
  onRemoveAttachment,
  onSave,
}: ItemDrawerProps) {
  const activeAttachments = attachments.filter(
    (attachment) => !attachment.deletedAt,
  )

  function renderFooter(props: BottomSheetFooterProps) {
    return (
      <BottomSheetFooter {...props} style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onSave}
        >
          <Icon name="check" size={18} color={colors.white} />
          <Text style={styles.saveButtonText}>Salvar e fechar</Text>
        </Pressable>
      </BottomSheetFooter>
    )
  }

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={['59%']}
      footerComponent={renderFooter}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <View style={styles.titleCol}>
            <Text style={styles.eyebrow}>
              Item {itemIndex} de {itemsTotal}
            </Text>
            <Text style={styles.title}>{title}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.closeButton,
              pressed && { opacity: 0.7 },
            ]}
            hitSlop={12}
            onPress={onClose}
            accessibilityLabel="Fechar"
          >
            <Icon name="multiply" size={16} color={colors.ink.base} />
          </Pressable>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Tags do item</Text>
          <TagMultiSelect
            selectedIds={tagsIds}
            availableTags={availableTags}
            allTagsById={allTagsById}
            onChange={onChangeTags}
            onCreateTag={onCreateTag}
            variant="muted"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Observação (opcional)</Text>
          <BottomSheetTextInput
            value={note}
            onChangeText={onNoteChange}
            placeholder="Adicionar observação..."
            placeholderTextColor={colors.gray[400]}
            style={styles.noteBox}
            multiline
          />
        </View>

        <View style={styles.qtyRow}>
          <Text style={styles.qtyLabel}>Quantidade</Text>
          {quantity === null ? (
            <Pressable
              style={({ pressed }) => pressed && { opacity: 0.7 }}
              onPress={() => onQuantityChange(0)}
            >
              <Text style={styles.addQuantity}>+ Adicionar</Text>
            </Pressable>
          ) : (
            <View style={styles.qtyStepperRow}>
              <Stepper value={quantity} onChange={onQuantityChange} />
              <Pressable
                style={({ pressed }) => pressed && { opacity: 0.7 }}
                hitSlop={12}
                onPress={() => onQuantityChange(null)}
              >
                <Icon name="trash-2" size={16} color={colors.gray[400]} />
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.field}>
          <View style={styles.photosHeader}>
            <Text style={styles.qtyLabel}>Fotos</Text>
            <Text style={styles.photosCount}>
              {activeAttachments.length} anexadas
            </Text>
          </View>
          <View style={styles.photosRow}>
            {activeAttachments.map((attachment) => (
              <PhotoThumb
                key={attachment.id}
                uri={attachment.url}
                onRemove={() => onRemoveAttachment(attachment.id)}
              />
            ))}
            {pendingPhotos.map((pending) => (
              <PhotoThumb
                key={pending.id}
                uri={pending.uri}
                uploading
                progress={pending.progress}
              />
            ))}
            <AddPhotoButton onPress={onAddPhoto} />
          </View>
        </View>
      </BottomSheetScrollView>
    </AppBottomSheet>
  )
}
