import { defineOp } from '@/lib/offline-queue/ops'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import { convexClient } from '@/lib/convex/client'
import { api } from '../../../../convex/_generated/api'

export interface ChecklistSaveArgs {
  id: string
  entity: Checklist
}

/**
 * One op covers both create and update: `checklists.save` on the server is
 * already a real upsert (replace if the external id exists, else insert),
 * so the local overlay is the same "replace wholesale with the new entity"
 * either way — there is no merge to get wrong between the two cases.
 */
export const checklistSave = defineOp<ChecklistSaveArgs, Checklist>('checklists.save', {
  kind: 'checklist',
  send: (args) => convexClient.mutation(api.checklists.save, args as never),
  applyLocal: (_entity, args) => args.entity,
  entityId: (args) => args.id,
})

/**
 * Deletes the checklist and every one of its applications in a single
 * server-side transaction. Queued like every other write, so deleting
 * offline is as durable as filling a vistoria offline — the previous
 * direct `convexClient.mutation` call simply hung with no network and was
 * lost on a kill.
 *
 * The overlay for this op only marks the *checklist* deleted; the
 * applications it cascades into are a different `kind` and stay visible
 * until the server confirms. `useChecklistLibrary` closes that gap by
 * dropping applications whose checklist is no longer in the list.
 */
export const checklistSoftDeleteCascade = defineOp<
  { id: string; deletedAt: string },
  Checklist
>('checklists.softDeleteCascade', {
  kind: 'checklist',
  send: (args) => convexClient.mutation(api.checklists.softDeleteCascade, args as never),
  applyLocal: (entity, args) => {
    if (!entity) return null
    return { ...entity, deletedAt: args.deletedAt }
  },
  entityId: (args) => args.id,
})
