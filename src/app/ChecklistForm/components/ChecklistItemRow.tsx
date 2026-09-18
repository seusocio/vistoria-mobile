import { memo } from 'react'
import { useReorderableDrag } from 'react-native-reorderable-list'
import { ItemCard } from '@/components/ItemCard'
import { TagChipList } from '@/components'
import type { ChecklistFormItemState } from '@/hooks/useChecklistForm'
import { haptics } from '@/utils/haptics'
import { styles } from './ChecklistItemRow.styles'

interface ChecklistItemRowProps {
  item: ChecklistFormItemState
  index: number
  labels: string[]
  onEdit: () => void
  onRemove: () => void
}

export const ChecklistItemRow = memo(function ChecklistItemRow({
  item,
  index,
  labels,
  onEdit,
  onRemove,
}: ChecklistItemRowProps) {
  const drag = useReorderableDrag()

  return (
    <ItemCard.Root
      style={styles.rowContainer}
      onPress={onEdit}
      onDragStart={() => {
        haptics.dragStart()
        drag()
      }}
      accessibilityLabel={`Editar item ${index + 1}`}
    >
      <ItemCard.Badge>{index + 1}</ItemCard.Badge>
      <ItemCard.Content>
        <ItemCard.Title style={styles.title} numberOfLines={1} muted={!item.title}>
          {item.title || 'Item sem título'}
        </ItemCard.Title>
        {item.description ? (
          <ItemCard.Description>{item.description}</ItemCard.Description>
        ) : null}
        {labels.length > 0 && <TagChipList labels={labels} tone="neutral" />}
      </ItemCard.Content>
      <ItemCard.TrailingButton
        icon="trash-2"
        hitSlop={14}
        onPress={onRemove}
        accessibilityLabel={`Remover item ${index + 1}`}
      />
    </ItemCard.Root>
  )
})
