import { AnimatePresence, MotiView } from 'moti'
import { memo, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import type { PanGesture } from 'react-native-gesture-handler'
import { LinearTransition } from 'react-native-reanimated'
import { NestedReorderableList, reorderItems } from 'react-native-reorderable-list'
import { shallow } from 'zustand/shallow'
import type { ApplicationItem, Checklist } from '@/infra/domain/entities'
import { isItemAnswerComplete, reorderChecklistItems } from '@/infra/services'
import { ApplicationItemGroupHeader } from './ApplicationItemGroupHeader'
import { ApplicationItemRow } from './ApplicationItemRow'

interface ApplicationItemGroupSectionProps {
  title: string
  /** the items to actually render here, already sorted by checklist order */
  groupItems: ApplicationItem[]
  /** total items this section represents - may exceed groupItems.length when completed ones moved to the "Concluídos" section */
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
  onAnswerChange: (itemId: string, answer: string) => void
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
 * One accordion section (a room/area, the trailing "Outros itens" bucket for
 * ad-hoc items, or the global "Concluídos" bucket). Owns its own optimistic
 * reorder state so multiple sections can be expanded and reordered
 * independently, but shares one pan-gesture instance (passed down) with
 * every other section.
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
  onAnswerChange,
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
    if (from === to) return
    const movedItem = items[from]
    const targetItem = items[to]
    if (!movedItem?.checklistItemId || !targetItem?.checklistItemId) return
    const templateFrom = checklist.items.findIndex(
      (item) => item.id === movedItem.checklistItemId,
    )
    const templateTo = checklist.items.findIndex(
      (item) => item.id === targetItem.checklistItemId,
    )
    if (templateFrom < 0 || templateTo < 0) return

    const previousItems = items
    setOptimisticItems(reorderItems(previousItems, from, to))
    setReorderPending(true)
    try {
      await reorderChecklistItems(checklist.id, templateFrom, templateTo)
    } catch {
      setOptimisticItems(previousItems)
      setReorderPending(false)
      onError('Não foi possível reordenar os itens')
    }
  }

  return (
    <View style={styles.section}>
      <ApplicationItemGroupHeader
        title={title}
        answered={answered}
        total={total}
        expanded={expanded}
        onToggle={() => onToggle(groupKey)}
      />
      <AnimatePresence>
        {expanded && (
          <MotiView
            from={{ opacity: 0, translateY: -8 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: -8 }}
            transition={{ type: 'timing', duration: 180 }}
            style={styles.body}
          >
            <NestedReorderableList
              data={items}
              scrollable={false}
              scrollEnabled={false}
              contentContainerStyle={styles.itemsList}
              panGesture={panGesture}
              itemLayoutAnimation={LinearTransition.duration(220)}
              keyExtractor={(item) => item.id}
              onReorder={handleReorder}
              renderItem={({ item }: { item: ApplicationItem }) => {
                const complete = isItemAnswerComplete(item, checklist)
                return (
                  <ApplicationItemRow
                    item={item}
                    canDrag={Boolean(item.checklistItemId) && !complete}
                    options={checklist.options}
                    tagLabel={resolveTagLabel(item)}
                    suggestionEnabled={suggestionEnabled}
                    onAnswerChange={onAnswerChange}
                    onOpenDrawer={onOpenDrawer}
                    onAcceptSuggestion={onAcceptSuggestion}
                    onRejectSuggestion={onRejectSuggestion}
                  />
                )
              }}
            />
          </MotiView>
        )}
      </AnimatePresence>
    </View>
  )
}, arePropsEqual)

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  body: {
    paddingLeft: 8,
  },
  itemsList: {
    gap: 10,
  },
})
