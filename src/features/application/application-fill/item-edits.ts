import type { ItemCompletionVariant } from '@/components/ItemCard'
import type { Application, ApplicationItem, WorkflowStatus } from '@/features/application/shared/application.types'
import { applyApplicationItemPatch, type ApplicationItemPatch } from '@/features/application/shared/application.utils'

/*
 * What the fill screen's taps do to an item, as plain data. The screen
 * buffers these locally (`use-pending-item-edits.ts`) and only turns them into
 * ops when it is left with intent to keep the work.
 */

/** One `editItem` call. Handlers return them in the order they must be applied. */
export type ItemEdit = [itemId: string, patch: ApplicationItemPatch]

/** Per item, everything edited since the screen opened, merged; `updatedAt` is the last edit's. */
export type PendingItemPatches = Record<string, { patch: ApplicationItemPatch; updatedAt: string }>

/** A second edit on the same item combines with the first — what N sequential ops would have produced. */
export function mergePendingPatch(
  prev: PendingItemPatches,
  itemId: string,
  patch: ApplicationItemPatch,
  updatedAt: string,
): PendingItemPatches {
  return {
    ...prev,
    [itemId]: { patch: { ...prev[itemId]?.patch, ...patch }, updatedAt },
  }
}

/** The application as the screen shows it: the server/overlay copy with the buffered edits on top. */
export function applyPendingEdits(
  base: Application,
  pendingItemPatches: PendingItemPatches,
  pendingNewItems: ApplicationItem[],
): Application {
  let next = base
  for (const [itemId, { patch, updatedAt }] of Object.entries(pendingItemPatches)) {
    next = applyApplicationItemPatch(next, itemId, patch, updatedAt)
  }
  if (pendingNewItems.length > 0) {
    next = { ...next, items: [...next.items, ...pendingNewItems] }
  }
  return next
}

/** A typed answer always wins over a suggestion that put the previous one there. */
function answerEdit(itemId: string, answer: string): ItemEdit {
  return [itemId, { answer, suggested: false, suggestionSource: null }]
}

function workflowStatusEdit(itemId: string, workflowStatus: WorkflowStatus | null): ItemEdit {
  return [itemId, { workflowStatus }]
}

/** The item's checkbox: flips between the positive answer and no answer. Completing clears any workflow status. */
export function toggleCompleteEdits(
  items: ApplicationItem[],
  itemId: string,
  positiveOptionLabel: string | undefined,
): ItemEdit[] {
  if (!positiveOptionLabel) return []
  const item = items.find((candidate) => candidate.id === itemId)
  const complete = item?.answer === positiveOptionLabel
  const edits = [answerEdit(itemId, complete ? '' : positiveOptionLabel)]
  if (!complete && item?.workflowStatus) edits.push(workflowStatusEdit(itemId, null))
  return edits
}

/** The group header's checkbox: sets (or clears) every item in the group at once. */
export function toggleGroupCompleteEdits(
  items: ApplicationItem[],
  itemIds: string[],
  complete: boolean,
  positiveOptionLabel: string | undefined,
): ItemEdit[] {
  if (complete && !positiveOptionLabel) return []
  const edits: ItemEdit[] = []
  for (const itemId of itemIds) {
    edits.push(answerEdit(itemId, complete ? (positiveOptionLabel as string) : ''))
    if (complete) {
      const item = items.find((candidate) => candidate.id === itemId)
      if (item?.workflowStatus) edits.push(workflowStatusEdit(itemId, null))
    }
  }
  return edits
}

/**
 * The drawer's status picker. `completed` and `idle` are answers (positive or
 * none); anything else is a workflow status layered on top of the answer.
 */
export function selectStatusEdits(
  items: ApplicationItem[],
  itemId: string,
  status: ItemCompletionVariant,
  positiveOptionLabel: string | undefined,
): ItemEdit[] {
  if (status === 'completed' || status === 'idle') {
    const item = items.find((candidate) => candidate.id === itemId)
    const complete = item?.answer === positiveOptionLabel
    const shouldComplete = status === 'completed'
    const edits: ItemEdit[] = []
    if (complete !== shouldComplete && positiveOptionLabel) {
      edits.push(answerEdit(itemId, shouldComplete ? positiveOptionLabel : ''))
    }
    if (item?.workflowStatus) edits.push(workflowStatusEdit(itemId, null))
    return edits
  }
  return [workflowStatusEdit(itemId, status)]
}
