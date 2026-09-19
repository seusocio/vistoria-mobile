import { memo, useCallback, useMemo } from 'react'
import { useReorderableDrag } from 'react-native-reorderable-list'
import { TagChipList } from '@/components'
import { Collapsible } from '@/components/Collapsible'
import { ItemCard } from '@/components/ItemCard'
import { haptics } from '@/utils/haptics'
import type { ChecklistFormItemState } from '../checklist-form.schema'

interface ChecklistItemRowProps {
  item: ChecklistFormItemState
  index: number
  /** Stable across renders (useTagsCatalog memoizes it), so the labels below memoize with the item. */
  resolveLabels: (tagsIds: string[]) => string[]
  /** Takes the field-array key so one callback serves every row in the list. */
  onEdit: (key: string) => void
  onRemove: (key: string) => void
}

/**
 * Every prop here is either a value or a callback keyed by item, so memo()
 * actually holds: re-rendering the form (opening a sheet, toggling a group)
 * leaves untouched rows alone instead of rebuilding ten card shells and their
 * drag handlers.
 */
export const ChecklistItemRow = memo(function ChecklistItemRow({
  item,
  index,
  resolveLabels,
  onEdit,
  onRemove,
}: ChecklistItemRowProps) {
  const drag = useReorderableDrag()
  const labels = useMemo(
    () => resolveLabels(item.tagsIds),
    [resolveLabels, item.tagsIds],
  )

  const handleDragStart = useCallback(() => {
    haptics.dragStart()
    drag()
  }, [drag])
  const handlePress = useCallback(() => onEdit(item.key), [onEdit, item.key])
  const handleRemove = useCallback(
    () => onRemove(item.key),
    [onRemove, item.key],
  )

  return (
    <Collapsible.Row
      onPress={handlePress}
      onDragStart={handleDragStart}
      accessibilityLabel={`Editar item ${index + 1}`}
    >
      <ItemCard.Badge>{index + 1}</ItemCard.Badge>
      <ItemCard.Content>
        <Collapsible.RowTitle numberOfLines={1} muted={!item.title}>
          {item.title || 'Item sem título'}
        </Collapsible.RowTitle>
        {item.description ? (
          <ItemCard.Description>{item.description}</ItemCard.Description>
        ) : null}
        {labels.length > 0 && <TagChipList labels={labels} tone="neutral" />}
      </ItemCard.Content>
      <ItemCard.TrailingButton
        icon="trash-2"
        hitSlop={14}
        onPress={handleRemove}
        accessibilityLabel={`Remover item ${index + 1}`}
      />
    </Collapsible.Row>
  )
})
