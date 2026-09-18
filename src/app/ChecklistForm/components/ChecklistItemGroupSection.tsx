import type { PanGesture } from 'react-native-gesture-handler'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { NestedReorderableList } from 'react-native-reorderable-list'
import { Collapsible } from '@/components/Collapsible'
import type { ChecklistFormItemState } from '@/hooks/useChecklistForm'
import { ChecklistItemGroupHeader } from './ChecklistItemGroupHeader'
import { ChecklistItemRow } from './ChecklistItemRow'
import { COLLAPSIBLE_TRANSITION } from '@/components/Collapsible/contants'

interface ChecklistItemGroupSectionProps {
  title: string
  items: ChecklistFormItemState[]
  /** Hidden for the common case of a single, unlabeled bucket - a checklist that never used the "Label: " prefix convention looks exactly like a flat list. */
  showHeader: boolean
  expanded: boolean
  onToggle: () => void
  panGesture: PanGesture
  resolveLabels: (tagsIds: string[]) => string[]
  onEdit: (key: string) => void
  onRemove: (key: string) => void
  onReorder: (from: number, to: number) => void
}

/**
 * One accordion section (a room/area, or the trailing "Outros itens" bucket)
 * of checklist template items - the authoring-time counterpart of
 * ApplicationItemGroupSection. Reordering here just moves items within the
 * flat template array, so it skips the optimistic-state/rollback machinery
 * that section needs for its network-backed reorder mutation.
 */
export function ChecklistItemGroupSection({
  title,
  items,
  showHeader,
  expanded,
  onToggle,
  panGesture,
  resolveLabels,
  onEdit,
  onRemove,
  onReorder,
}: ChecklistItemGroupSectionProps) {
  const list = (
    <NestedReorderableList
      data={items}
      scrollable={false}
      scrollEnabled={false}
      panGesture={panGesture}
      itemLayoutAnimation={COLLAPSIBLE_TRANSITION}
      keyExtractor={(item) => item.key}
      onReorder={({ from, to }) => onReorder(from, to)}
      renderItem={({ item, index }: { item: ChecklistFormItemState; index: number }) => (
        <ChecklistItemRow
          item={item}
          index={index}
          labels={resolveLabels(item.tagsIds)}
          onEdit={() => onEdit(item.key)}
          onRemove={() => onRemove(item.key)}
        />
      )}
    />
  )

  if (!showHeader) return list

  return (
    <Animated.View layout={LinearTransition.duration(220)}>
      <ChecklistItemGroupHeader
        title={title}
        count={items.length}
        expanded={expanded}
        onToggle={onToggle}
      />
      <Collapsible expanded={expanded}>{list}</Collapsible>
    </Animated.View>
  )
}
