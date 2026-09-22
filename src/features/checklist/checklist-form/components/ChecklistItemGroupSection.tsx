import { memo, useCallback, useState } from 'react'
import { NestedReorderableList } from 'react-native-reorderable-list'
import {
  COLLAPSIBLE_ROW_TRANSITION,
  Collapsible,
} from '@/components/Collapsible'
import { useReorderablePanGesture } from '@/lib/gestures/use-reorderable-pan-gesture'
import type { ChecklistFormItemState } from '../checklist-form.schema'
import { ChecklistItemRow } from './ChecklistItemRow'

interface ChecklistItemGroupSectionProps {
  title: string
  items: ChecklistFormItemState[]
  /** Hidden for the common case of a single, unlabeled bucket - a checklist that never used the "Label: " prefix convention looks exactly like a flat list. */
  showHeader: boolean
  resolveLabels: (tagsIds: string[]) => string[]
  /** Each callback below takes the key it acts on, so the parent passes one stable instance to every section. */
  onEdit: (key: string) => void
  onRemove: (key: string) => void
  onReorder: (fromKey: string, toKey: string) => void
}

/**
 * One accordion section (a room/area, or the trailing "Outros itens" bucket)
 * of checklist template items - the authoring-time counterpart of
 * ApplicationItemGroupSection. Reordering here just moves items within the
 * flat template array, so it skips the optimistic-state/rollback machinery
 * that section needs for its network-backed reorder mutation.
 *
 * The parent memoizes `groups`, so a plain memo() holds here: opening a sheet
 * or toggling a *different* group no longer re-renders this list.
 */
export const ChecklistItemGroupSection = memo(function ChecklistItemGroupSection({
  title,
  items,
  showHeader,
  resolveLabels,
  onEdit,
  onRemove,
  onReorder,
}: ChecklistItemGroupSectionProps) {
  // One instance per list - the list mutates it (see useReorderablePanGesture).
  const panGesture = useReorderablePanGesture()
  // Owned here rather than lifted to the screen: nothing outside this section
  // reads it, and holding it in the form meant every toggle re-rendered the
  // whole form to flip one boolean in one section.
  const [expanded, setExpanded] = useState(true)
  const handleToggle = useCallback(() => setExpanded((current) => !current), [])

  // Sections only know their own slice, so a reorder is reported as the two
  // item keys involved and the parent maps them back to flat-array indices.
  const handleReorder = useCallback(
    ({ from, to }: { from: number; to: number }) => {
      const fromKey = items[from]?.key
      const toKey = items[to]?.key
      if (!fromKey || !toKey || fromKey === toKey) return
      onReorder(fromKey, toKey)
    },
    [items, onReorder],
  )

  const renderItem = useCallback(
    ({ item, index }: { item: ChecklistFormItemState; index: number }) => (
      <ChecklistItemRow
        item={item}
        index={index}
        resolveLabels={resolveLabels}
        onEdit={onEdit}
        onRemove={onRemove}
      />
    ),
    [resolveLabels, onEdit, onRemove],
  )

  const list = (
    <NestedReorderableList
      data={items}
      scrollable={false}
      scrollEnabled={false}
      panGesture={panGesture}
      // Adding an item, removing one, and restoring one from the undo toast all
      // shift the rows below; without this they jump.
      itemLayoutAnimation={COLLAPSIBLE_ROW_TRANSITION}
      // This list never scrolls, so every row is mounted regardless and
      // virtualization only costs. Left at the default 10, opening a group of
      // 12 renders ten rows, measures, animates open, then renders the rest in
      // a second async batch - which is exactly why the trouble started at
      // "more than 10 items". One pass instead.
      initialNumToRender={items.length}
      keyExtractor={keyExtractor}
      onReorder={handleReorder}
      renderItem={renderItem}
    />
  )

  if (!showHeader) return list

  return (
    <Collapsible.Root expanded={expanded} onToggle={handleToggle}>
      <Collapsible.Header title={title}>
        <Collapsible.HeaderCount>{items.length}</Collapsible.HeaderCount>
      </Collapsible.Header>
      <Collapsible.Content>{list}</Collapsible.Content>
    </Collapsible.Root>
  )
})

function keyExtractor(item: ChecklistFormItemState) {
  return item.key
}
