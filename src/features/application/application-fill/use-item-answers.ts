import { useCallback } from 'react'
import type { ItemCompletionVariant } from '@/components/ItemCard'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import type { ApplicationItem } from '@/features/application/shared/application.types'
import type { ApplicationItemPatch } from '@/features/application/shared/application.utils'
import { type ItemEdit, selectStatusEdits, toggleCompleteEdits, toggleGroupCompleteEdits } from './item-edits'

export interface UseItemAnswersProps {
  items: ApplicationItem[]
  /** The checklist's "sim" label — what marks an item complete. */
  positiveOptionLabel: string | undefined
  editItem: (itemId: string, patch: ApplicationItemPatch) => void
}

/** What a tap on an item's checkbox, its group's checkbox, the drawer's status picker or a suggestion does to that item's answer. */
export function useItemAnswers({ items, positiveOptionLabel, editItem }: UseItemAnswersProps) {
  const applyEdits = useCallback(
    (edits: ItemEdit[]) => {
      for (const [itemId, patch] of edits) editItem(itemId, patch)
    },
    [editItem],
  )
  const handleToggleComplete = useCallback(
    (itemId: string) => applyEdits(toggleCompleteEdits(items, itemId, positiveOptionLabel)),
    [items, applyEdits, positiveOptionLabel],
  )
  const handleToggleGroupComplete = useCallback(
    (itemIds: string[], complete: boolean) =>
      applyEdits(toggleGroupCompleteEdits(items, itemIds, complete, positiveOptionLabel)),
    [items, applyEdits, positiveOptionLabel],
  )
  const handleSelectStatus = useCallback(
    (itemId: string, status: ItemCompletionVariant) =>
      applyEdits(selectStatusEdits(items, itemId, status, positiveOptionLabel)),
    [items, applyEdits, positiveOptionLabel],
  )
  const handleAcceptSuggestion = useCallback(
    (itemId: string) => {
      if (!FEATURE_FLAG.suggestion) return
      editItem(itemId, { suggested: false, suggestionSource: null })
    },
    [editItem],
  )
  const handleRejectSuggestion = useCallback(
    (itemId: string) => {
      if (!FEATURE_FLAG.suggestion) return
      editItem(itemId, { suggested: false, suggestionSource: null, answer: '', note: '' })
    },
    [editItem],
  )

  return {
    onToggleComplete: handleToggleComplete,
    onToggleGroupComplete: handleToggleGroupComplete,
    onSelectStatus: handleSelectStatus,
    onAcceptSuggestion: handleAcceptSuggestion,
    onRejectSuggestion: handleRejectSuggestion,
  }
}
