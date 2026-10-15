import { useMemo } from 'react'
import type { ApplicationItem } from '@/features/application/shared/application.types'
import { groupItemsByTitlePrefix, isItemAnswerComplete, sortItemsByChecklistOrder } from '@/features/application/shared/application.utils'
import type { Checklist } from '@/features/checklist/shared/checklist.types'

/** The fill screen's accordion sections: items in checklist order, grouped by title prefix, completed ones last in their group. */
export function useItemGroups(items: ApplicationItem[], checklist: Checklist) {
  // One sort and one completeness pass feed both lists below, instead of each
  // re-sorting every item and re-deriving completeness on every answer tap.
  const sortedItems = useMemo(
    () => sortItemsByChecklistOrder(items, checklist),
    [items, checklist],
  )
  const completedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of sortedItems) {
      if (isItemAnswerComplete(item, checklist)) ids.add(item.id)
    }
    return ids
  }, [sortedItems, checklist])
  const groups = useMemo(
    () =>
      groupItemsByTitlePrefix(sortedItems).map((group) => {
        const incomplete = group.children.filter((item) => !completedIds.has(item.id))
        const completed = group.children.filter((item) => completedIds.has(item.id))
        return {
          key: group.label ?? 'ungrouped',
          title: group.label ?? 'Outros itens',
          total: group.children.length,
          answered: completed.length,
          // Completed items sink to the end of their own group's list instead
          // of moving to a separate section, so the group they belong to stays
          // legible while still keeping them out of the way of active items.
          children: [...incomplete, ...completed],
        }
      }),
    [sortedItems, completedIds],
  )
  return groups
}
