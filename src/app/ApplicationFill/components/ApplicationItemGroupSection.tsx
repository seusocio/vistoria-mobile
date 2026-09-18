import { memo, useCallback, useEffect, useState } from 'react'
import { NestedReorderableList, reorderItems } from 'react-native-reorderable-list'
import { shallow } from 'zustand/shallow'
import {
  COLLAPSIBLE_ROW_TRANSITION,
  Collapsible,
} from '@/components/Collapsible'
import type { ItemCompletionVariant } from '@/components/ItemCard'
import { useReorderablePanGesture } from '@/hooks/useReorderablePanGesture'
import type { ApplicationItem, Checklist } from '@/infra/domain/entities'
import { isItemAnswerComplete, reorderChecklistItems } from '@/infra/services'
import { ApplicationItemGroupHeader } from './ApplicationItemGroupHeader'
import { ApplicationItemRow } from './ApplicationItemRow'

interface ApplicationItemGroupSectionProps {
  title: string
  /** the items to actually render here, already sorted by checklist order, completed ones last */
  groupItems: ApplicationItem[]
  total: number
  answered: number
  checklist: Checklist
  suggestionEnabled: boolean
  resolveTagLabel: (item: ApplicationItem) => string | undefined
  onToggleComplete: (itemId: string) => void
  onToggleGroupComplete: (itemIds: string[], complete: boolean) => void
  onOpenDrawer: (itemId: string) => void
  onAcceptSuggestion: (itemId: string) => void
  onRejectSuggestion: (itemId: string) => void
  onError: (message: string) => void
}

/**
 * The parent rebuilds `groupItems` on every render, so the default shallow
 * memo never holds and answering one item re-renders every section (and every
 * reorderable list inside them). Items keep their identity unless they really
 * changed, so comparing element-wise lets untouched sections bail out.
 *
 * Bailing out also skips this component's effects - which is correct here:
 * identical contents mean the reorder-sync effect below has nothing to settle,
 * and any real reorder changes the order and so fails this comparison.
 */
function arePropsEqual(
  previous: ApplicationItemGroupSectionProps,
  next: ApplicationItemGroupSectionProps,
): boolean {
  const { groupItems: previousItems, ...previousRest } = previous
  const { groupItems: nextItems, ...nextRest } = next
  // shallow() compares arrays element-wise and objects key-wise, so splitting
  // groupItems out is all it takes to get the one extra level of depth. Every
  // other prop is compared automatically, including ones added later.
  return shallow(previousItems, nextItems) && shallow(previousRest, nextRest)
}

/**
 * One accordion section (a room/area, or the trailing "Outros itens" bucket
 * for ad-hoc items). Owns its own optimistic reorder state so multiple
 * sections can be expanded and reordered independently, but shares one
 * pan-gesture instance (passed down) with every other section.
 */
export const ApplicationItemGroupSection = memo(function ApplicationItemGroupSection({
  title,
  groupItems: serverChildren,
  total,
  answered,
  checklist,
  suggestionEnabled,
  resolveTagLabel,
  onToggleComplete,
  onToggleGroupComplete,
  onOpenDrawer,
  onAcceptSuggestion,
  onRejectSuggestion,
  onError,
}: ApplicationItemGroupSectionProps) {
  const [optimisticItems, setOptimisticItems] = useState<ApplicationItem[] | null>(null)
  const [reorderPending, setReorderPending] = useState(false)
  const items = optimisticItems ?? serverChildren
  // One instance per list - the list mutates it (see useReorderablePanGesture).
  const panGesture = useReorderablePanGesture()
  // Owned here rather than lifted to the screen. Nothing outside this section
  // reads it, and holding it at the screen root meant every toggle re-rendered
  // the entire fill screen - gallery, voice card, progress, drawer - to flip
  // one boolean in one section.
  const [expanded, setExpanded] = useState(false)
  const handleToggle = useCallback(() => setExpanded((current) => !current), [])

  useEffect(() => {
    if (!optimisticItems) return
    const isSynced =
      optimisticItems.length === serverChildren.length &&
      optimisticItems.every((item, index) => serverChildren[index]?.id === item.id)
    if (isSynced) {
      setOptimisticItems(null)
      setReorderPending(false)
    } else if (!reorderPending) {
      setOptimisticItems(null)
    }
  }, [optimisticItems, reorderPending, serverChildren])

  const handleReorder = useCallback(
    async ({ from, to }: { from: number; to: number }) => {
      // Completed items are pinned to the tail (see the parent's `groups` memo) and
      // are never drag sources (`canDrag` below), but an incomplete item could
      // still be dropped past them without this clamp - keeping the invariant
      // "completed items always come last within their group" intact.
      const completedCount = items.filter((item) => isItemAnswerComplete(item, checklist)).length
      const maxIndex = Math.max(items.length - completedCount - 1, 0)
      const clampedTo = Math.min(to, maxIndex)
      if (from === clampedTo) return
      const movedItem = items[from]
      const targetItem = items[clampedTo]
      if (!movedItem?.checklistItemId || !targetItem?.checklistItemId) return
      const templateFrom = checklist.items.findIndex(
        (item) => item.id === movedItem.checklistItemId,
      )
      const templateTo = checklist.items.findIndex(
        (item) => item.id === targetItem.checklistItemId,
      )
      if (templateFrom < 0 || templateTo < 0) return

      const previousItems = items
      setOptimisticItems(reorderItems(previousItems, from, clampedTo))
      setReorderPending(true)
      try {
        await reorderChecklistItems(checklist.id, templateFrom, templateTo)
      } catch {
        setOptimisticItems(previousItems)
        setReorderPending(false)
        onError('Não foi possível reordenar os itens')
      }
    },
    [items, checklist, onError],
  )

  // Clicking the header's leading progress ring fills or unfills every item
  // in the group at once, mirroring each row's own leading-dot toggle - a
  // group that isn't fully done fills; a fully done group clears back out.
  const handleToggleGroup = useCallback(() => {
    const allComplete = total > 0 && answered === total
    onToggleGroupComplete(
      items.map((item) => item.id),
      !allComplete,
    )
  }, [total, answered, items, onToggleGroupComplete])

  // Inline, this arrow would be a new function on every render, which makes
  // the list rebuild every cell even when nothing about the data changed.
  const renderItem = useCallback(
    ({ item }: { item: ApplicationItem }) => {
      const complete = isItemAnswerComplete(item, checklist)
      const completionVariant: ItemCompletionVariant = complete
        ? 'completed'
        : (item.workflowStatus ?? 'idle')
      return (
        <ApplicationItemRow
          item={item}
          canDrag={Boolean(item.checklistItemId) && !complete}
          completionVariant={completionVariant}
          tagLabel={resolveTagLabel(item)}
          suggestionEnabled={suggestionEnabled}
          onToggleComplete={onToggleComplete}
          onOpenDrawer={onOpenDrawer}
          onAcceptSuggestion={onAcceptSuggestion}
          onRejectSuggestion={onRejectSuggestion}
        />
      )
    },
    [
      checklist,
      resolveTagLabel,
      suggestionEnabled,
      onToggleComplete,
      onOpenDrawer,
      onAcceptSuggestion,
      onRejectSuggestion,
    ],
  )

  // No `layout` animation on a wrapper around all of this: Collapsible.Content
  // already animates its own height, which reflows every sibling below it for
  // free. Wrapping the section as well put a second animator on the same
  // measurement, snapshotting the whole row subtree every layout pass.
  return (
    <Collapsible.Root expanded={expanded} onToggle={handleToggle}>
      <ApplicationItemGroupHeader
        title={title}
        answered={answered}
        total={total}
        onToggleAll={handleToggleGroup}
      />
      <Collapsible.Content>
        <NestedReorderableList
          data={items}
          scrollable={false}
          scrollEnabled={false}
          panGesture={panGesture}
          // Load-bearing: confirming an item sinks it to the end of the group
          // (see the `groups` memo in ApplicationFill), and this is what slides
          // the row down instead of teleporting it.
          itemLayoutAnimation={COLLAPSIBLE_ROW_TRANSITION}
          // This list never scrolls, so every row is mounted regardless and
          // virtualization only costs. Left at the default 10, opening a group
          // of 12 renders ten rows, measures, animates open, then renders the
          // rest in a second async batch - which is exactly why the trouble
          // started at "more than 10 items". One pass instead.
          initialNumToRender={items.length}
          keyExtractor={keyExtractor}
          onReorder={handleReorder}
          renderItem={renderItem}
        />
      </Collapsible.Content>
    </Collapsible.Root>
  )
}, arePropsEqual)

function keyExtractor(item: ApplicationItem) {
  return item.id
}
