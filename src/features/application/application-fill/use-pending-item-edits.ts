import { useCallback, useMemo, useState } from 'react'
import type { Application, ApplicationItem } from '@/features/application/shared/application.types'
import type { ApplicationItemPatch } from '@/features/application/shared/application.utils'
import { enqueueOp } from '@/lib/offline-queue'
import { addItem, patchItem } from '../shared/application.ops'
import { applyPendingEdits, mergePendingPatch, type PendingItemPatches } from './item-edits'

const EMPTY_APPLICATION: Application = {
  id: '',
  checklistId: '',
  tagsIds: [],
  date: '',
  status: 'draft',
  items: [],
  attachments: [],
  gallerySourceApplicationId: null,
  createdAt: '',
  updatedAt: '',
  completedAt: null,
  deletedAt: null,
}

export interface UsePendingItemEditsProps {
  /** The server/overlay copy; `null` while it loads. */
  normalizedApplication: Application | null
  checklistId: string
}

export function usePendingItemEdits({ normalizedApplication, checklistId }: UsePendingItemEditsProps) {
  /**
   * Item edits (answer taps, notes, workflow status, ad-hoc adds) no longer
   * enqueue on every change — each one used to become its own REST round
   * trip the instant it happened, which was fine for a cheap Convex mutation
   * over an open socket but is a lot of network chatter for one HTTP request
   * per keystroke. These accumulate locally instead and flush as one op per
   * touched item at the three points that actually leave this screen with
   * intent to keep the work (`onBack`, "salvar rascunho", "concluir") — the
   * tradeoff being that an app kill before any of those, or a route away
   * this screen doesn't model as one of them, loses everything typed since
   * it opened. Deleting the application discards instead of flushing:
   * patching items on an entity about to be soft-deleted is just a wasted
   * write. `pendingItemPatches` merges cumulatively per item (a second tap
   * on the same item combines with the first, matching what N sequential
   * ops would have produced). Voice recordings don't buffer: each one is
   * posted straight away as its own Note (`postVoiceNote`).
   */
  const [pendingItemPatches, setPendingItemPatches] = useState<PendingItemPatches>({})
  const [pendingNewItems, setPendingNewItems] = useState<ApplicationItem[]>([])

  const application = useMemo(
    () => applyPendingEdits(normalizedApplication ?? EMPTY_APPLICATION, pendingItemPatches, pendingNewItems),
    [normalizedApplication, pendingItemPatches, pendingNewItems],
  )

  const editItem = useCallback((itemId: string, patch: ApplicationItemPatch) => {
    const updatedAt = new Date().toISOString()
    setPendingItemPatches((prev) => mergePendingPatch(prev, itemId, patch, updatedAt))
  }, [])

  const addPendingItem = useCallback((item: ApplicationItem) => {
    setPendingNewItems((prev) => [...prev, item])
  }, [])

  // --- lifecycle: draft / complete / delete ------------------------------
  /**
   * Turns the accumulated local edits into real ops — one `patchItem` per
   * touched item (each carrying that item's fully-merged patch, not one op
   * per tap that built it up) and one `addItem` per ad-hoc item. Called
   * explicitly at every point that leaves this screen with intent to keep
   * the work: the header back arrow, "salvar rascunho", and "concluir".
   * `confirmDelete` deliberately does not call this — patching items on an
   * entity about to be soft-deleted is a wasted write, so it discards
   * instead.
   */
  const flushPendingChanges = useCallback(() => {
    const applicationId = normalizedApplication?.id
    if (applicationId) {
      for (const [itemId, { patch, updatedAt }] of Object.entries(pendingItemPatches)) {
        enqueueOp(patchItem, { applicationId, checklistId, itemId, patch, updatedAt })
      }
      for (const item of pendingNewItems) {
        enqueueOp(addItem, { applicationId, checklistId, item, updatedAt: item.updatedAt })
      }
    }
    setPendingItemPatches({})
    setPendingNewItems([])
  }, [normalizedApplication?.id, checklistId, pendingItemPatches, pendingNewItems])

  return { application, editItem, addPendingItem, flushPendingChanges }
}
