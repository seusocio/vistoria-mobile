import { defineOp } from '@/lib/offline-queue/ops'
import type { Checklist } from '@/infra/domain/entities'
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
  mutation: api.checklists.save,
  applyLocal: (_entity, args) => args.entity,
  entityId: (args) => args.id,
})
