import { defineOp } from '@/lib/offline-queue'
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
  applyLocal: (entity, args) =>
    applyApplicationItemPatch(entity as Application, args.itemId, args.patch, args.updatedAt),
  entityId: (args) => args.applicationId,
})

export const addItem = defineOp<
  { applicationId: string; item: Application['items'][number]; updatedAt: string },
  Application
>('applications.addItem', {
  mutation: api.applications.addItem,
  applyLocal: (entity, args) => {
    const application = entity as Application
    if (application.items.some((item) => item.id === args.item.id)) return application
    return { ...application, items: [...application.items, args.item], updatedAt: args.updatedAt }
  },
  entityId: (args) => args.applicationId,
})

export const addAttachment = defineOp<
  { applicationId: string; itemId: string | null; attachment: Attachment; updatedAt: string },
  Application
>('applications.addAttachment', {
  mutation: api.applications.addAttachment,
  applyLocal: (entity, args) => {
    const application = entity as Application
    if (args.itemId === null) {
      if (application.attachments.some((a) => a.id === args.attachment.id)) return application
      return {
        ...application,
        attachments: [...application.attachments, args.attachment],
        updatedAt: args.updatedAt,
      }
    }
    const item = findItem(application, args.itemId)
    if (!item || item.attachments.some((a) => a.id === args.attachment.id)) return application
    return {
      ...application,
      items: application.items.map((current) =>
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
    const application = entity as Application
    const update = (attachment: Attachment) =>
      attachment.id === args.attachmentId ? { ...attachment, deletedAt: args.deletedAt } : attachment
    if (args.itemId === null) {
      return { ...application, attachments: application.attachments.map(update), updatedAt: args.updatedAt }
    }
    return {
      ...application,
      items: application.items.map((item) =>
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
    const application = entity as Application
    const drop = (attachments: Attachment[]) =>
      attachments.filter((attachment) => attachment.id !== args.attachmentId)
    if (args.itemId === null) {
      return { ...application, attachments: drop(application.attachments) }
    }
    return {
      ...application,
      items: application.items.map((item) =>
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
    const { applicationId: _applicationId, ...meta } = args
    return { ...(entity as Application), ...meta }
  },
  entityId: (args) => args.applicationId,
})

export const softDelete = defineOp<{ id: string; deletedAt: string }, Application>(
  'applications.softDelete',
  {
    mutation: api.applications.softDelete,
    applyLocal: (entity, args) => ({ ...(entity as Application), deletedAt: args.deletedAt }),
    entityId: (args) => args.id,
  },
)
