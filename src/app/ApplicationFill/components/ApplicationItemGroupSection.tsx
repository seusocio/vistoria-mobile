import { memo, useEffect, useState } from 'react'
import type { PanGesture } from 'react-native-gesture-handler'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { NestedReorderableList, reorderItems } from 'react-native-reorderable-list'
import { shallow } from 'zustand/shallow'
import { Collapsible } from '@/components/Collapsible'
import type { ItemCompletionVariant } from '@/components/ItemCard'
import type { ApplicationItem, Checklist } from '@/infra/domain/entities'
import { isItemAnswerComplete, reorderChecklistItems } from '@/infra/services'
import { ApplicationItemGroupHeader } from './ApplicationItemGroupHeader'
import { ApplicationItemRow } from './ApplicationItemRow'
import { COLLAPSIBLE_TRANSITION } from '@/components/Collapsible/contants'

interface ApplicationItemGroupSectionProps {
  title: string
  /** the items to actually render here, already sorted by checklist order, completed ones last */
  groupItems: ApplicationItem[]
  total: number
  answered: number
  checklist: Checklist
  expanded: boolean
  groupKey: string
  /** takes the key so the parent can pass one stable callback to every section */
  onToggle: (groupKey: string) => void
  suggestionEnabled: boolean
  /** shared across every section so only one pan gesture is ever mounted for the whole screen */
  panGesture: PanGesture
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
  expanded,
  groupKey,
  onToggle,
  suggestionEnabled,
  panGesture,
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

  async function handleReorder({ from, to }: { from: number; to: number }) {
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
  }

  // Clicking the header's leading progress ring fills or unfills every item
  // in the group at once, mirroring each row's own leading-dot toggle - a
  // group that isn't fully done fills; a fully done group clears back out.
  function handleToggleGroup() {
    const allComplete = total > 0 && answered === total
    onToggleGroupComplete(
      items.map((item) => item.id),
      !allComplete,
    )
  }

  return (
    <Animated.View layout={LinearTransition.duration(220)}>
      <ApplicationItemGroupHeader
        title={title}
        answered={answered}
        total={total}
        expanded={expanded}
        onToggle={() => onToggle(groupKey)}
        onToggleAll={handleToggleGroup}
      />
      <Collapsible expanded={expanded}>
        <NestedReorderableList
          data={items}
          scrollable={false}
          scrollEnabled={false}
          panGesture={panGesture}
          itemLayoutAnimation={COLLAPSIBLE_TRANSITION}
          keyExtractor={(item) => item.id}
          onReorder={handleReorder}
          renderItem={({ item }: { item: ApplicationItem }) => {
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
          }}
        />
      </Collapsible>
    </Animated.View>
  )
}, arePropsEqual)
