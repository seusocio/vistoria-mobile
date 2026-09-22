import type { Checklist } from '@/features/checklist/shared/checklist.types'
import { generateId } from '@/lib/id'

/**
 * Builds the "(cópia)" of a checklist from the copy the screen already has
 * in memory, so duplicating is a pure transform plus one queued op.
 *
 * The previous version re-fetched the checklist through a repository before
 * saving it, which made a duplicate impossible without a network round trip
 * — and dropped it entirely if the app was killed before the save landed.
 *
 * Items get fresh ids: the external id is the server's idempotency key, so
 * reusing them would make the copy's `save` overwrite the original's items.
 */
export function buildDuplicatedChecklist(existing: Checklist): Checklist {
  const now = new Date().toISOString()
  return {
    ...existing,
    id: generateId('checklist_'),
    title: `${existing.title} (cópia)`,
    items: existing.items.map((item, index) => ({
      ...item,
      id: generateId('citem_'),
      position: index,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

/**
 * Moves one checklist item and renumbers `position` for the whole list.
 *
 * Pure, and takes the checklist the caller already holds: the previous
 * version re-read it through a repository and wrote it back with `await`,
 * which made reordering fail outright with no network — and left the list
 * silently reverted. Callers now queue the result as a `checklists.save`.
 *
 * Returns the checklist unchanged when the move is a no-op or out of range.
 */
export function reorderChecklistItems(
  checklist: Checklist,
  from: number,
  to: number,
): Checklist {
  const { items } = checklist
  if (from === to) return checklist
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return checklist

  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)

  return {
    ...checklist,
    items: next.map((item, index) => ({ ...item, position: index })),
    updatedAt: new Date().toISOString(),
  }
}
