import { ApiError } from '@/lib/api/fetcher'
import { defineOp } from '@/lib/offline-queue/ops'
import type { Application, Attachment } from '@/features/application/shared/application.types'
import {
  addAttachmentRest,
  applicationsListAllQueryKey,
  deleteAttachmentRest,
  isApplicationGone,
  updateAttachmentUploadStatusRest,
} from '@/features/application/shared/application.rest'
import { patchCachedAttachments, refreshApplicationCache } from '@/features/application/shared/application.cache'
import { notesQueryKey, updateNotesCache } from '@/features/note/shared/note.rest'
import { requireActiveProject } from '@/lib/session/require-active-project'

/*
 * The application ops that write one attachment (`kind: 'application'`, so
 * they live under the Visita's overlay and scope). Kept apart from
 * `application.ops.ts` because these are the ones the upload queue drives —
 * see ADRs 0001/0002 before changing any of them.
 */

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

export const addAttachment = defineOp<
  { applicationId: string; itemId: string | null; attachment: Attachment; updatedAt: string },
  Application
>('applications.addAttachment', {
  kind: 'application',
  isScopeGone: isApplicationGone,
  send: (args) => {
    const { orgId, projectId } = requireActiveProject('applications')
    return addAttachmentRest(orgId, projectId, args.applicationId, args.itemId, args.attachment)
  },
  // The response is one attachment, not the whole `Application` this op's
  // overlay tracks — same gap as `patchItem`/`addItem`. A direct re-fetch
  // brings the server's copy (its own id, any derived `attachmentsCount`)
  // back in over the optimistic local one — see `refreshApplicationCache`
  // for why this isn't just `invalidates`.
  onServerResponse: (queryClient, args) => {
    const { orgId, projectId } = requireActiveProject('applications')
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
    const { orgId, projectId } = requireActiveProject('applications')
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
  send: (args) => {
    const { orgId, projectId } = requireActiveProject('applications')
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
    const { orgId, projectId } = requireActiveProject('applications')
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
    const { orgId, projectId } = requireActiveProject('applications')
    return [applicationsListAllQueryKey(orgId, projectId), notesQueryKey(orgId, projectId, args.applicationId)]
  },
})

/**
 * Written by the upload worker once the blob is in storage. It goes
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
  send: (args) => {
    const { orgId, projectId } = requireActiveProject('applications')
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
    const { orgId, projectId } = requireActiveProject('applications')
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
  send: (args) => {
    const { orgId, projectId } = requireActiveProject('applications')
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
    const { orgId, projectId } = requireActiveProject('applications')
    void refreshApplicationCache(queryClient, orgId, projectId, args.applicationId)
  },
})
