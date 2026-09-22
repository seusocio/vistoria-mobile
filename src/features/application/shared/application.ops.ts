import { defineOp } from '@/lib/offline-queue/ops'
import type { Application, Attachment } from '@/features/application/shared/application.types'
import { applyApplicationItemPatch, type ApplicationItemPatch } from '@/features/application/shared/application.utils'
import { api } from '../../../../convex/_generated/api'

function findItem(application: Application, itemId: string) {
  return application.items.find((item) => item.id === itemId)
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
  mutation: api.applications.create,
  applyLocal: (entity, args) => entity ?? args.entity,
  entityId: (args) => args.entity.id,
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
  { applicationId: string; itemId: string; patch: ApplicationItemPatch; updatedAt: string },
  Application
>('applications.patchItem', {
  kind: 'application',
  mutation: api.applications.patchItem,
  applyLocal: (entity, args) => {
    if (!entity) return null
    return applyApplicationItemPatch(entity, args.itemId, args.patch, args.updatedAt)
  },
  entityId: (args) => args.applicationId,
})

export const addItem = defineOp<
  { applicationId: string; item: Application['items'][number]; updatedAt: string },
  Application
>('applications.addItem', {
  kind: 'application',
  mutation: api.applications.addItem,
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
  mutation: api.applications.addAttachment,
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

export const setAttachmentDeletedAt = defineOp<
  {
    applicationId: string
    itemId: string | null
    attachmentId: string
    deletedAt: string | null
    updatedAt: string
  },
  Application
>('applications.setAttachmentDeletedAt', {
  kind: 'application',
  mutation: api.applications.setAttachmentDeletedAt,
  applyLocal: (entity, args) => {
    if (!entity) return null
    const update = (attachment: Attachment) =>
      attachment.id === args.attachmentId ? { ...attachment, deletedAt: args.deletedAt } : attachment
    if (args.itemId === null) {
      return { ...entity, attachments: entity.attachments.map(update), updatedAt: args.updatedAt }
    }
    return {
      ...entity,
      items: entity.items.map((item) =>
        item.id === args.itemId
          ? { ...item, attachments: item.attachments.map(update), updatedAt: args.updatedAt }
          : item,
      ),
      updatedAt: args.updatedAt,
    }
  },
  entityId: (args) => args.applicationId,
})

export const purgeAttachment = defineOp<
  { applicationId: string; itemId: string | null; attachmentId: string },
  Application
>('applications.purgeAttachment', {
  kind: 'application',
  mutation: api.applications.purgeAttachment,
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
})

/**
 * Written by the upload worker once the blob is in Convex storage. It goes
 * through the outbox like every other write: the upload itself can succeed
 * seconds before the app is killed, and losing this op would leave a photo
 * stored on the server that the app keeps re-uploading forever.
 */
export const setAttachmentUploaded = defineOp<
  { applicationId: string; attachmentId: string; storageId: string; updatedAt: string },
  Application
>('applications.setAttachmentUploaded', {
  kind: 'application',
  mutation: api.applications.setAttachmentUploaded,
  applyLocal: (entity, args) => {
    if (!entity) return null
    const update = (attachment: Attachment) =>
      attachment.id === args.attachmentId
        ? { ...attachment, storageId: args.storageId, uploadStatus: 'uploaded' as const }
        : attachment
    return {
      ...entity,
      attachments: entity.attachments.map(update),
      items: entity.items.map((item) => ({ ...item, attachments: item.attachments.map(update) })),
      updatedAt: args.updatedAt,
    }
  },
  entityId: (args) => args.applicationId,
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
  mutation: api.applications.setAttachmentUploadStatus,
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
})

export const updateMeta = defineOp<
  {
    applicationId: string
    tagsIds?: string[]
    date?: string
    transcript?: string | null
    status?: Application['status']
    completedAt?: string | null
    updatedAt: string
  },
  Application
>('applications.updateMeta', {
  kind: 'application',
  mutation: api.applications.updateMeta,
  applyLocal: (entity, args) => {
    if (!entity) return null
    const { applicationId: _applicationId, ...meta } = args
    return { ...entity, ...meta }
  },
  entityId: (args) => args.applicationId,
})

export const softDelete = defineOp<{ id: string; deletedAt: string }, Application>(
  'applications.softDelete',
  {
    kind: 'application',
    mutation: api.applications.softDelete,
    applyLocal: (entity, args) => {
      if (!entity) return null
      return { ...entity, deletedAt: args.deletedAt }
    },
    entityId: (args) => args.id,
  },
)
