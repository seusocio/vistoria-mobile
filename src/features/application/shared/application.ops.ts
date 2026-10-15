import { ApiError } from '@/lib/api/fetcher'
import { defineOp } from '@/lib/offline-queue/ops'
import type { Application, Attachment } from '@/features/application/shared/application.types'
import {
  addAttachmentRest,
  addApplicationItemRest,
  applicationGroupsQueryKey,
  applicationQueryKey,
  applicationsListAllQueryKey,
  applicationsListByChecklistQueryKey,
  createApplicationRest,
  deleteApplicationRest,
  deleteAttachmentRest,
  isApplicationGone,
  patchCachedAttachments,
  refreshApplicationCache,
  updateApplicationItemRest,
  updateApplicationMetaRest,
  updateAttachmentUploadStatusRest,
} from '@/features/application/shared/application.rest'
import { applyApplicationItemPatch, type ApplicationItemPatch } from '@/features/application/shared/application.utils'
import { notesQueryKey, updateNotesCache } from '@/features/note/shared/note.rest'
import { convexClient } from '@/lib/convex/client'
import { useSessionStore } from '@/lib/session/session.store'
import { api } from '../../../../convex/_generated/api'

/**
 * The server's upload machine only allows `failed → pending → uploaded`. A
 * photo that failed once (the `failed` write reached the server) and later
 * uploaded fine is `failed` there, so a direct `uploaded` is answered 409.
 * The blob is already in storage at this point, so step through `pending`.
 */
async function markUploadedRest(orgId: string, projectId: string, attachmentId: string) {
  try {
    return await updateAttachmentUploadStatusRest(orgId, projectId, attachmentId, 'uploaded')
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error
    await updateAttachmentUploadStatusRest(orgId, projectId, attachmentId, 'pending')
    return updateAttachmentUploadStatusRest(orgId, projectId, attachmentId, 'uploaded')
  }
}

function findItem(application: Application, itemId: string) {
  return application.items.find((item) => item.id === itemId)
}

function requireActiveProject(): { orgId: string; projectId: string } {
  const { activeOrgId, activeProjectId } = useSessionStore.getState()
  if (!activeOrgId || !activeProjectId) {
    throw new Error('applications: no active organization/project session')
  }
  return { orgId: activeOrgId, projectId: activeProjectId }
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
  send: (args) => convexClient.mutation(api.applications.create, args as never),
  sendRest: (args) => {
    const { orgId, projectId } = requireActiveProject()
    return createApplicationRest(orgId, projectId, args.entity)
  },
  applyLocal: (entity, args) => entity ?? args.entity,
  entityId: (args) => args.entity.id,
  onServerResponse: (queryClient, args, response) => {
    const { orgId, projectId } = requireActiveProject()
    queryClient.setQueryData(applicationQueryKey(orgId, projectId, args.entity.id), response)
  },
  invalidates: (args) => {
    const { orgId, projectId } = requireActiveProject()
    return [
      applicationsListAllQueryKey(orgId, projectId),
      applicationsListByChecklistQueryKey(orgId, projectId, args.entity.checklistId),
      applicationGroupsQueryKey(orgId, projectId, args.entity.checklistId),
    ]
  },
})

/**
 * Every answer tap, workflow-status change, and item-drawer save becomes its
 * own patchItem op the moment it happens — no local batching layer. The
 * outbox's own persist-then-drain already gives the "instant + durable"
 * property `itemEdits.ts` used to provide through in-memory React state;
 * `applyApplicationItemPatch` (shared with the Convex handler) is the one
 * merge rule both sides agree on.
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
  send: (args) => convexClient.mutation(api.applications.patchItem, args as never),
  sendRest: (args) => {
    const { orgId, projectId } = requireActiveProject()
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
    const { orgId, projectId } = requireActiveProject()
    return [
      applicationQueryKey(orgId, projectId, args.applicationId),
      applicationsListAllQueryKey(orgId, projectId),
      applicationsListByChecklistQueryKey(orgId, projectId, args.checklistId),
      applicationGroupsQueryKey(orgId, projectId, args.checklistId),
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
  send: (args) => convexClient.mutation(api.applications.addItem, args as never),
  sendRest: (args) => {
    const { orgId, projectId } = requireActiveProject()
    return addApplicationItemRest(orgId, projectId, args.applicationId, args.item)
  },
  // Same reasoning as `patchItem`'s `invalidates` - the list is this op's
  // stale-read risk too, not just the single-entity read.
  invalidates: (args) => {
    const { orgId, projectId } = requireActiveProject()
    return [
      applicationQueryKey(orgId, projectId, args.applicationId),
      applicationsListAllQueryKey(orgId, projectId),
      applicationsListByChecklistQueryKey(orgId, projectId, args.checklistId),
      applicationGroupsQueryKey(orgId, projectId, args.checklistId),
    ]
  },
  applyLocal: (entity, args) => {
    if (!entity) return null
    if (entity.items.some((item) => item.id === args.item.id)) return entity
    return { ...entity, items: [...entity.items, args.item], updatedAt: args.updatedAt }
  },
  entityId: (args) => args.applicationId,
})

export const addAttachment = defineOp<
  { applicationId: string; itemId: string | null; attachment: Attachment; updatedAt: string },
  Application
>('applications.addAttachment', {
  kind: 'application',
  isScopeGone: isApplicationGone,
  send: (args) => convexClient.mutation(api.applications.addAttachment, args as never),
  sendRest: (args) => {
    const { orgId, projectId } = requireActiveProject()
    return addAttachmentRest(orgId, projectId, args.applicationId, args.itemId, args.attachment)
  },
  // The response is one attachment, not the whole `Application` this op's
  // overlay tracks — same gap as `patchItem`/`addItem`. A direct re-fetch
  // brings the server's copy (its own id, any derived `attachmentsCount`)
  // back in over the optimistic local one — see `refreshApplicationCache`
  // for why this isn't just `invalidates`.
  onServerResponse: (queryClient, args) => {
    const { orgId, projectId } = requireActiveProject()
    // Into the cache now, so the photo doesn't blink out between the op leaving the outbox and the refresh landing.
    const { attachment } = args
    const raw: Record<string, unknown> = {
      id: attachment.id,
      name: attachment.name,
      position: attachment.position,
      createdAt: attachment.createdAt,
      uploadStatus: attachment.uploadStatus ?? 'pending',
      mimeType: attachment.mimeType ?? null,
      width: attachment.width ?? null,
      height: attachment.height ?? null,
    }
    patchCachedAttachments(queryClient, orgId, projectId, args.applicationId, (attachments, itemId) =>
      itemId === args.itemId && !attachments.some((a) => a.id === attachment.id) ? [...attachments, raw] : attachments,
    )
    void refreshApplicationCache(queryClient, orgId, projectId, args.applicationId)
  },
  invalidates: () => {
    const { orgId, projectId } = requireActiveProject()
    return [applicationsListAllQueryKey(orgId, projectId)]
  },
  applyLocal: (entity, args) => {
    if (!entity) return null
    if (args.itemId === null) {
      if (entity.attachments.some((a) => a.id === args.attachment.id)) return entity
      return {
        ...entity,
        attachments: [...entity.attachments, args.attachment],
        updatedAt: args.updatedAt,
      }
    }
    const item = findItem(entity, args.itemId)
    if (!item || item.attachments.some((a) => a.id === args.attachment.id)) return entity
    return {
      ...entity,
      items: entity.items.map((current) =>
        current.id === args.itemId
          ? { ...current, attachments: [...current.attachments, args.attachment], updatedAt: args.updatedAt }
          : current,
      ),
      updatedAt: args.updatedAt,
    }
  },
  entityId: (args) => args.applicationId,
})

/**
 * Collapses what used to be two ops (`setAttachmentDeletedAt` for the
 * undo-toast window, `purgeAttachment` once it expired) into one real
 * deletion — the undo window is local-only UI state now
 * (`attachment-visibility.ts`), so nothing needs to be queued until there is
 * nothing left to undo.
 */
export const deleteAttachment = defineOp<
  { applicationId: string; itemId: string | null; attachmentId: string },
  Application
>('applications.deleteAttachment', {
  treatNotFoundAsDone: true,
  kind: 'application',
  isScopeGone: isApplicationGone,
  send: (args) => convexClient.mutation(api.applications.purgeAttachment, args as never),
  sendRest: (args) => {
    const { orgId, projectId } = requireActiveProject()
    return deleteAttachmentRest(orgId, projectId, args.attachmentId)
  },
  applyLocal: (entity, args) => {
    if (!entity) return null
    const drop = (attachments: Attachment[]) =>
      attachments.filter((attachment) => attachment.id !== args.attachmentId)
    if (args.itemId === null) {
      return { ...entity, attachments: drop(entity.attachments) }
    }
    return {
      ...entity,
      items: entity.items.map((item) =>
        item.id === args.itemId ? { ...item, attachments: drop(item.attachments) } : item,
      ),
    }
  },
  entityId: (args) => args.applicationId,
  // Out of the cache now — otherwise the deleted photo pops back for the
  // moment between the op leaving the outbox and the refresh landing. The
  // server also unlinks it from every note (and drops notes left empty), so
  // the feed cache gets the same treatment.
  onServerResponse: (queryClient, args) => {
    const { orgId, projectId } = requireActiveProject()
    patchCachedAttachments(queryClient, orgId, projectId, args.applicationId, (attachments) =>
      attachments.filter((a) => a.id !== args.attachmentId),
    )
    updateNotesCache(queryClient, orgId, projectId, args.applicationId, (notes) =>
      notes.flatMap((note) => {
        if (!note.attachmentIds.includes(args.attachmentId)) return [note]
        const attachmentIds = note.attachmentIds.filter((id) => id !== args.attachmentId)
        return note.text.trim() || attachmentIds.length > 0 ? [{ ...note, attachmentIds }] : []
      }),
    )
    void refreshApplicationCache(queryClient, orgId, projectId, args.applicationId)
  },
  invalidates: (args) => {
    const { orgId, projectId } = requireActiveProject()
    return [applicationsListAllQueryKey(orgId, projectId), notesQueryKey(orgId, projectId, args.applicationId)]
  },
})

/**
 * Written by the upload worker once the blob is in Convex storage. It goes
 * through the outbox like every other write: the upload itself can succeed
 * seconds before the app is killed, and losing this op would leave a photo
 * stored on the server that the app keeps re-uploading forever.
 */
export const setAttachmentUploaded = defineOp<
  {
    applicationId: string
    attachmentId: string
    /** New writers pass this. `storageId` stays accepted for compat with ops persisted by a build from before the REST cutover renamed it. */
    storageKey?: string
    storageId?: string
    updatedAt: string
  },
  Application
>('applications.setAttachmentUploaded', {
  kind: 'application',
  isScopeGone: isApplicationGone,
  // A 404 means the row was deleted while its bytes were still uploading — a
  // note deleted before it synced takes its photos with it. Nothing is left to
  // mark; failing would park this at the head and block every write behind it.
  treatNotFoundAsDone: true,
  send: (args) =>
    convexClient.mutation(api.applications.setAttachmentUploaded, {
      applicationId: args.applicationId,
      attachmentId: args.attachmentId,
      storageId: args.storageKey ?? args.storageId,
      updatedAt: args.updatedAt,
    } as never),
  sendRest: (args) => {
    const { orgId, projectId } = requireActiveProject()
    return markUploadedRest(orgId, projectId, args.attachmentId)
  },
  applyLocal: (entity, args) => {
    if (!entity) return null
    const storageKey = args.storageKey ?? args.storageId
    const update = (attachment: Attachment) =>
      attachment.id === args.attachmentId
        ? { ...attachment, storageId: storageKey, uploadStatus: 'uploaded' as const }
        : attachment
    return {
      ...entity,
      attachments: entity.attachments.map(update),
      items: entity.items.map((item) => ({ ...item, attachments: item.attachments.map(update) })),
      updatedAt: args.updatedAt,
    }
  },
  entityId: (args) => args.applicationId,
  // `updateAttachment`'s response is the attachment row with the server's
  // own `url` for the now-uploaded blob, not the whole `Application` this
  // op's overlay tracks — `applyLocal` above has no way to know that URL
  // (the local file is already deleted by the time this op resolves). A
  // direct re-fetch-and-overwrite gets the real thing into the cache instead
  // of hand-merging a raw wire object into it: that cache holds the *raw*
  // REST payload (`useApplicationRestResult` only normalizes it after
  // reading, per render), and any mismatch between a hand-built patch and
  // that raw shape silently corrupts the whole entity. See
  // `refreshApplicationCache` for why this isn't just `invalidates` either.
  onServerResponse: (queryClient, args) => {
    const { orgId, projectId } = requireActiveProject()
    patchCachedAttachments(queryClient, orgId, projectId, args.applicationId, (attachments) =>
      attachments.map((a) => (a.id === args.attachmentId ? { ...a, uploadStatus: 'uploaded' } : a)),
    )
    void refreshApplicationCache(queryClient, orgId, projectId, args.applicationId)
  },
})

export const setAttachmentUploadStatus = defineOp<
  {
    applicationId: string
    attachmentId: string
    uploadStatus: 'pending' | 'failed'
    updatedAt: string
  },
  Application
>('applications.setAttachmentUploadStatus', {
  kind: 'application',
  isScopeGone: isApplicationGone,
  bestEffort: true,
  send: (args) => convexClient.mutation(api.applications.setAttachmentUploadStatus, args as never),
  sendRest: (args) => {
    const { orgId, projectId } = requireActiveProject()
    return updateAttachmentUploadStatusRest(orgId, projectId, args.attachmentId, args.uploadStatus)
  },
  applyLocal: (entity, args) => {
    if (!entity) return null
    const update = (attachment: Attachment) =>
      attachment.id === args.attachmentId
        ? { ...attachment, uploadStatus: args.uploadStatus }
        : attachment
    return {
      ...entity,
      attachments: entity.attachments.map(update),
      items: entity.items.map((item) => ({ ...item, attachments: item.attachments.map(update) })),
      updatedAt: args.updatedAt,
    }
  },
  entityId: (args) => args.applicationId,
  onServerResponse: (queryClient, args) => {
    const { orgId, projectId } = requireActiveProject()
    void refreshApplicationCache(queryClient, orgId, projectId, args.applicationId)
  },
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
  send: (args) => convexClient.mutation(api.applications.updateMeta, args as never),
  sendRest: (args) => {
    const { orgId, projectId } = requireActiveProject()
    return updateApplicationMetaRest(orgId, projectId, args)
  },
  applyLocal: (entity, args) => {
    if (!entity) return null
    const { applicationId: _applicationId, checklistId: _checklistId, ...meta } = args
    return { ...entity, ...meta }
  },
  entityId: (args) => args.applicationId,
  onServerResponse: (queryClient, args, response) => {
    const { orgId, projectId } = requireActiveProject()
    queryClient.setQueryData(applicationQueryKey(orgId, projectId, args.applicationId), response)
  },
  // `tagsIds`/`date`/`status` are exactly what the list-based grouping and
  // "repetir"/copy-from-last read - same staleness risk as `patchItem`.
  invalidates: (args) => {
    const { orgId, projectId } = requireActiveProject()
    return [
      applicationsListAllQueryKey(orgId, projectId),
      applicationsListByChecklistQueryKey(orgId, projectId, args.checklistId),
      applicationGroupsQueryKey(orgId, projectId, args.checklistId),
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
  send: (args) => convexClient.mutation(api.applications.softDelete, args as never),
  sendRest: (args) => {
    const { orgId, projectId } = requireActiveProject()
    return deleteApplicationRest(orgId, projectId, args.id)
  },
  applyLocal: (entity, args) => {
    if (!entity) return null
    return { ...entity, deletedAt: args.deletedAt }
  },
  entityId: (args) => args.id,
  invalidates: (args) => {
    const { orgId, projectId } = requireActiveProject()
    return [
      applicationsListAllQueryKey(orgId, projectId),
      applicationsListByChecklistQueryKey(orgId, projectId, args.checklistId),
      applicationGroupsQueryKey(orgId, projectId, args.checklistId),
    ]
  },
})
