import { ItemDrawer } from '@/components'
import type { ApplicationFillContainer } from '../application-fill.container'

/** The open item's drawer (status, note, tags, quantity, photos). Renders nothing while no item is open. */
export function ApplicationItemDrawer({ c }: { c: ApplicationFillContainer }) {
  // Pulled into local consts so TS narrows them through the inline callbacks
  // below (`c.editingItem`, a property access, doesn't narrow across a
  // closure boundary the way a const binding does).
  const editingItem = c.editingItem
  const itemDraftValues = c.itemDraftValues
  if (!editingItem || !itemDraftValues) return null

  return (
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
      onQuantityChange={(quantity) => c.itemForm.setValue('quantity', quantity, { shouldDirty: true })}
      attachments={editingItem.attachments}
      uploadProgress={c.uploadProgress}
      onAddPhoto={() => c.onAddPhoto(editingItem.id)}
      onRemoveAttachment={(attachmentId) => c.onRemoveItemAttachment(editingItem.id, attachmentId)}
      onRetryAttachment={(attachmentId) => c.onRetryItemAttachment(editingItem.id, attachmentId)}
      onOpenPhoto={(index) => c.onOpenPhoto(editingItem.id, index)}
      onSave={c.onSaveItemDrawer}
    />
  )
}
