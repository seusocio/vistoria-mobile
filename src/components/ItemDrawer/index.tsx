import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { Pressable, Text, View } from 'react-native'
import { ItemCard, type ItemCompletionVariant } from '@/components/ItemCard'
import { Attachment, Tag } from '@/infra/domain/entities'
import { colors } from '@/styles'
import { AppBottomSheet } from '../AppBottomSheet'
import { Icon } from '../Icon'
import { PhotoGalleryRow } from '../PhotoGalleryRow'
import { Stepper } from '../Stepper'
import { TagMultiSelect } from '../TagMultiSelect'
import { useSheetFooterActions } from '../SheetFooterActions'
import { styles } from './styles'

const STATUS_OPTIONS: Array<{ variant: ItemCompletionVariant; label: string }> = [
  { variant: 'idle', label: 'Não concluído' },
  { variant: 'completed', label: 'Concluído' },
  { variant: 'in_progress', label: 'Executando' },
  { variant: 'in_review', label: 'Em revisão' },
  { variant: 'denied', label: 'Negado na revisão' },
]

export interface ItemDrawerProps {
  visible: boolean
  onClose: () => void
  itemIndex: number
  itemsTotal: number
  title: string
  completionVariant: ItemCompletionVariant
  onSelectStatus: (variant: ItemCompletionVariant) => void
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
  uploadProgress: Record<string, number>
  onAddPhoto: () => void
  onRemoveAttachment: (attachmentId: string) => void
  onRetryAttachment: (attachmentId: string) => void
  onOpenPhoto: (index: number) => void
  onSave: () => void
}

/** Component/ItemDrawer, shown as a gorhom bottom sheet (Screen/PreenchimentoComDrawer) */
export function ItemDrawer({
  visible,
  onClose,
  itemIndex,
  itemsTotal,
  title,
  completionVariant,
  onSelectStatus,
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
  uploadProgress,
  onAddPhoto,
  onRemoveAttachment,
  onRetryAttachment,
  onOpenPhoto,
  onSave,
}: ItemDrawerProps) {
  const activeAttachments = attachments.filter((attachment) => !attachment.deletedAt)
  const galleryPhotos = activeAttachments.map((attachment, index) => ({
    id: attachment.id,
    uri: attachment.url ?? attachment.localUri,
    uploading: attachment.uploadStatus === 'pending',
    failed: attachment.uploadStatus === 'failed',
    progress: uploadProgress[attachment.id] ?? 0,
    onPress: () => onOpenPhoto(index),
    onRemove: () => onRemoveAttachment(attachment.id),
    onRetry: () => onRetryAttachment(attachment.id),
  }))
  const footerComponent = useSheetFooterActions({
    confirmLabel: 'Salvar e fechar',
    onConfirm: onSave,
  })

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={['59%']}
      footerComponent={footerComponent}
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
          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((option) => {
              const selected = option.variant === completionVariant
              return (
                <View key={option.variant} style={styles.statusOption}>
                  <ItemCard.StatusDot
                    variant={option.variant}
                    onPress={() => onSelectStatus(option.variant)}
                    accessibilityLabel={option.label}
                  />
                  <Text style={[styles.statusOptionLabel, selected && styles.statusOptionLabelSelected]}>
                    {option.label}
                  </Text>
                </View>
              )
            })}
          </View>
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
          <PhotoGalleryRow photos={galleryPhotos} onAddPhoto={onAddPhoto} />
        </View>
      </BottomSheetScrollView>
    </AppBottomSheet>
  )
}
