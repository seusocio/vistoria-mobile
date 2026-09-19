import type { Application, ApplicationItem } from '@/infra/domain/entities'

/**
 * The item fields the fill screen edits before anything is saved.
 *
 * Same idea as the checklist form: the screen holds the changes, the server
 * sees them once, when the user saves. Attachments are deliberately not here -
 * photos upload in the background and keep writing straight to the document,
 * so they must keep coming from the server copy.
 *
 * These are exactly the fields `applicationItemPatch` accepts in
 * convex/validators.ts. The validator rejects anything else, so `toItemPatches`
 * below hands over the patch object and nothing around it.
 */
export type ItemEdit = Partial<
  Pick<
    ApplicationItem,
    | 'answer'
    | 'note'
    | 'quantity'
    | 'tagsIds'
    | 'workflowStatus'
    | 'suggested'
    | 'suggestionSource'
  >
>

/** Each item carries its own timestamp so editing one doesn't re-stamp the rest. */
interface PendingEdit {
  patch: ItemEdit
  editedAt: string
}

export type ItemEdits = Record<string, PendingEdit>

export function mergeItemEdit(
  edits: ItemEdits,
  itemId: string,
  edit: ItemEdit,
  editedAt: string,
): ItemEdits {
  return {
    ...edits,
    [itemId]: { patch: { ...edits[itemId]?.patch, ...edit }, editedAt },
  }
}

/**
 * Overlays the pending edits onto the server document for rendering.
 *
 * Items nobody touched are returned by reference, so the memoized sections and
 * rows below can still bail out - only the edited ones re-render.
 */
export function applyItemEdits(
  application: Application,
  edits: ItemEdits,
): Application {
  if (Object.keys(edits).length === 0) return application
  return {
    ...application,
    items: application.items.map((item) => {
      const pending = edits[item.id]
      if (!pending) return item
      const { patch, editedAt } = pending
      const next: ApplicationItem = { ...item, ...patch, updatedAt: editedAt }
      // Mirrors the `patchItems` handler, so what is on screen before saving is
      // what the server computes after.
      if (patch.suggested === false) next.suggestionSource = null
      if (patch.answer !== undefined && patch.answer !== item.answer) {
        next.answeredAt = patch.answer ? editedAt : null
      }
      return next
    }),
  }
}

/** The payload for the single `patchItems` call that saves the screen. */
export function toItemPatches(
  edits: ItemEdits,
): Array<{ itemId: string; patch: ItemEdit }> {
  return Object.entries(edits).map(([itemId, pending]) => ({
    itemId,
    patch: pending.patch,
  }))
}
