import { defineOp } from '@/lib/offline-queue/ops'
import type { Application } from '@/features/application/shared/application.types'
import {
  addApplicationItemRest,
  applicationQueryKey,
  applicationsListAllQueryKey,
  applicationsListByChecklistQueryKey,
  createApplicationRest,
  deleteApplicationRest,
  isApplicationGone,
  updateApplicationItemRest,
  updateApplicationMetaRest,
} from '@/features/application/shared/application.rest'
import { applicationGroupsQueryKey } from '@/features/application/shared/application-groups.rest'
import { applyApplicationItemPatch, type ApplicationItemPatch } from '@/features/application/shared/application.utils'
import { requireActiveProject } from '@/lib/session/require-active-project'

/**
 * The application reads a write to `tagsIds`/`date`/`status`/items can leave
 * stale: the flat lists "copiar da última"/"repetir" read, and the histórico's
 * groups.
 */
function applicationListKeys(orgId: string, projectId: string, checklistId: string) {
  return [
    applicationsListAllQueryKey(orgId, projectId),
    applicationsListByChecklistQueryKey(orgId, projectId, checklistId),
    applicationGroupsQueryKey(orgId, projectId, checklistId),
  ]
}

/**
 * Mirrors `applications.create`, which is insert-if-absent: replaying it
 * against a row that already exists is a no-op, both here and on the server.
 *
 * This op is what makes every other application op safe. The rest are
 * patches, and a patch whose target row doesn't exist is answered by the
 * server with `return null` — the write evaporates. Creating through the
 * outbox instead of a fire-and-forget mutation is what guarantees the
 * `create` is still in front of its own patches after a process kill.
 */
export const create = defineOp<{ entity: Application }, Application>('applications.create', {
  kind: 'application',
  isScopeGone: isApplicationGone,
  send: (args) => {
    const { orgId, projectId } = requireActiveProject('applications')
    return createApplicationRest(orgId, projectId, args.entity)
  },
  applyLocal: (entity, args) => entity ?? args.entity,
  entityId: (args) => args.entity.id,
  onServerResponse: (queryClient, args, response) => {
    const { orgId, projectId } = requireActiveProject('applications')
    queryClient.setQueryData(applicationQueryKey(orgId, projectId, args.entity.id), response)
  },
  invalidates: (args) => {
    const { orgId, projectId } = requireActiveProject('applications')
    return [
      ...applicationListKeys(orgId, projectId, args.entity.checklistId),
    ]
  },
})

/**
 * Every answer tap, workflow-status change, and item-drawer save becomes its
 * own patchItem op the moment it happens — no local batching layer. The
 * outbox's own persist-then-drain already gives the "instant + durable"
 * property `itemEdits.ts` used to provide through in-memory React state;
 * `applyApplicationItemPatch` is the one merge rule the overlay and the
 * server agree on.
 */
export const patchItem = defineOp<
  {
    applicationId: string
    checklistId: string
    itemId: string
    patch: ApplicationItemPatch
    updatedAt: string
  },
  Application
>('applications.patchItem', {
  kind: 'application',
  isScopeGone: isApplicationGone,
  send: (args) => {
    const { orgId, projectId } = requireActiveProject('applications')
    return updateApplicationItemRest(orgId, projectId, {
      itemId: args.itemId,
      updatedAt: args.updatedAt,
      ...args.patch,
    })
  },
  applyLocal: (entity, args) => {
    if (!entity) return null
    return applyApplicationItemPatch(entity, args.itemId, args.patch, args.updatedAt)
  },
  entityId: (args) => args.applicationId,
  // The item response has no relation to the parent Application's other
  // fields — invalidating the single application read is what brings the
  // rest of the entity (counts, other items) back in line, same as
  // checklists' pattern for a write whose response is narrower than the
  // entity the overlay tracks. The list keys need invalidating too: once
  // this op drains, the overlay stops re-applying it from the outbox, so
  // "copiar da última"/"repetir" (both read off the applications list, not
  // the single-entity query) would otherwise keep citing whatever answers
  // were on that list's last fetch - silently dropping every item answered
  // since.
  invalidates: (args) => {
    const { orgId, projectId } = requireActiveProject('applications')
    return [
      applicationQueryKey(orgId, projectId, args.applicationId),
      ...applicationListKeys(orgId, projectId, args.checklistId),
    ]
  },
})

export const addItem = defineOp<
  {
    applicationId: string
    checklistId: string
    item: Application['items'][number]
    updatedAt: string
  },
  Application
>('applications.addItem', {
  kind: 'application',
  isScopeGone: isApplicationGone,
  send: (args) => {
    const { orgId, projectId } = requireActiveProject('applications')
    return addApplicationItemRest(orgId, projectId, args.applicationId, args.item)
  },
  // Same reasoning as `patchItem`'s `invalidates` - the list is this op's
  // stale-read risk too, not just the single-entity read.
  invalidates: (args) => {
    const { orgId, projectId } = requireActiveProject('applications')
    return [
      applicationQueryKey(orgId, projectId, args.applicationId),
      ...applicationListKeys(orgId, projectId, args.checklistId),
    ]
  },
  applyLocal: (entity, args) => {
    if (!entity) return null
    if (entity.items.some((item) => item.id === args.item.id)) return entity
    return { ...entity, items: [...entity.items, args.item], updatedAt: args.updatedAt }
  },
  entityId: (args) => args.applicationId,
})

export const updateMeta = defineOp<
  {
    applicationId: string
    checklistId: string
    tagsIds?: string[]
    date?: string
    status?: Application['status']
    completedAt?: string | null
    updatedAt: string
  },
  Application
>('applications.updateMeta', {
  kind: 'application',
  isScopeGone: isApplicationGone,
  send: (args) => {
    const { orgId, projectId } = requireActiveProject('applications')
    return updateApplicationMetaRest(orgId, projectId, args)
  },
  applyLocal: (entity, args) => {
    if (!entity) return null
    const { applicationId: _applicationId, checklistId: _checklistId, ...meta } = args
    return { ...entity, ...meta }
  },
  entityId: (args) => args.applicationId,
  onServerResponse: (queryClient, args, response) => {
    const { orgId, projectId } = requireActiveProject('applications')
    queryClient.setQueryData(applicationQueryKey(orgId, projectId, args.applicationId), response)
  },
  // `tagsIds`/`date`/`status` are exactly what the list-based grouping and
  // "repetir"/copy-from-last read - same staleness risk as `patchItem`.
  invalidates: (args) => {
    const { orgId, projectId } = requireActiveProject('applications')
    return [
      ...applicationListKeys(orgId, projectId, args.checklistId),
    ]
  },
})

export const softDelete = defineOp<
  { id: string; deletedAt: string; checklistId: string },
  Application
>('applications.softDelete', {
  treatNotFoundAsDone: true,
  kind: 'application',
  isScopeGone: isApplicationGone,
  send: (args) => {
    const { orgId, projectId } = requireActiveProject('applications')
    return deleteApplicationRest(orgId, projectId, args.id)
  },
  applyLocal: (entity, args) => {
    if (!entity) return null
    return { ...entity, deletedAt: args.deletedAt }
  },
  entityId: (args) => args.id,
  invalidates: (args) => {
    const { orgId, projectId } = requireActiveProject('applications')
    return [
      ...applicationListKeys(orgId, projectId, args.checklistId),
    ]
  },
})
