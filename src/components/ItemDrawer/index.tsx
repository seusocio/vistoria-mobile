import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Attachment, Tag } from '@/infra/domain/entities'
import { colors } from '@/styles'
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
  onAddPhoto: () => void
  onRemoveAttachment: (attachmentId: string) => void
  onSave: () => void
}

/** Component/ItemDrawer, shown as an overlay (Screen/PreenchimentoComDrawer) */
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
  onAddPhoto,
  onRemoveAttachment,
  onSave,
}: ItemDrawerProps) {
  const activeAttachments = attachments.filter(
    (attachment) => !attachment.deletedAt,
  )

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouchable} onPress={onClose} />
        <View style={styles.sheet}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>

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
              <TextInput
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
                <AddPhotoButton onPress={onAddPhoto} />
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
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
          </View>
        </View>
      </View>
    </Modal>
  )
}
