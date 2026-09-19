import { defineOp } from '@/lib/offline-queue/ops'
import type { Application, Attachment } from '@/infra/domain/entities'
import { applyApplicationItemPatch, type ApplicationItemPatch } from '@/infra/services'
import { api } from '../../../../convex/_generated/api'

function findItem(application: Application, itemId: string) {
  return application.items.find((item) => item.id === itemId)
}

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
    mutation: api.applications.softDelete,
    applyLocal: (entity, args) => {
      if (!entity) return null
      return { ...entity, deletedAt: args.deletedAt }
    },
    entityId: (args) => args.id,
  },
)
