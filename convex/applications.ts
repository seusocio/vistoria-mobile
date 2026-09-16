import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'

type ApplicationDocument = Doc<'applications'>
type PersistedAttachment = ApplicationDocument['attachments'][number]
type AttachmentWithUrl = PersistedAttachment & { url?: string }
type ApplicationWithUrls = Omit<ApplicationDocument, 'attachments' | 'items'> & {
  attachments: AttachmentWithUrl[]
  items: Array<
    Omit<ApplicationDocument['items'][number], 'attachments'> & {
      attachments: AttachmentWithUrl[]
    }
  >
}
type StorageContext = QueryCtx | MutationCtx

async function withImageUrls(
  ctx: StorageContext,
  entity: ApplicationDocument,
): Promise<ApplicationWithUrls> {
  const resolveAttachment = async (
    attachment: PersistedAttachment,
  ): Promise<AttachmentWithUrl> => {
    if (attachment.storageId) {
      const url = await ctx.storage.getUrl(attachment.storageId as Id<'_storage'>)
      return url ? { ...attachment, url } : attachment
    }
    return attachment.localUri ? { ...attachment, url: attachment.localUri } : attachment
  }

  return {
    ...entity,
    attachments: await Promise.all(entity.attachments.map(resolveAttachment)),
    items: await Promise.all(
      entity.items.map(async (item) => ({
        ...item,
        attachments: await Promise.all(item.attachments.map(resolveAttachment)),
      })),
    ),
  }
}

async function getApp(ctx: MutationCtx, id: string) {
  return ctx.db
    .query('applications')
    .withIndex('by_external_id', (q) => q.eq('id', id))
    .first()
}

export const listByChecklistId = query({
  args: { checklistId: v.string() },
  handler: async (ctx, { checklistId }) =>
    ctx.db
      .query('applications')
      .withIndex('by_checklist_id', (q) => q.eq('checklistId', checklistId))
      .filter((q) => q.eq(q.field('deletedAt'), null))
      .collect(),
})

export const listAll = query({
  args: {},
  handler: async (ctx) =>
    ctx.db
      .query('applications')
      .filter((q) => q.eq(q.field('deletedAt'), null))
      .collect(),
})

export const findById = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const application = await ctx.db
      .query('applications')
      .withIndex('by_external_id', (q) => q.eq('id', id))
      .first()
    return application && !application.deletedAt
      ? withImageUrls(ctx, application)
      : null
  },
})

export const create = mutation({
  args: { entity: v.any() },
  handler: async (ctx, { entity }) => {
    const existing = await getApp(ctx, entity.id)
    if (!existing) await ctx.db.insert('applications', entity)
    return null
  },
})

export const patchItem = mutation({
  args: {
    applicationId: v.string(),
    itemId: v.string(),
    patch: v.any(),
    updatedAt: v.string(),
  },
  handler: async (ctx, { applicationId, itemId, patch, updatedAt }) => {
    const application = await getApp(ctx, applicationId)
    if (!application) return null
    const items = application.items.map((item) => {
      if (item.id !== itemId) return item
      const next = { ...item, ...patch, updatedAt }
      if (patch.suggested === false) next.suggestionSource = null
      if ('answer' in patch && patch.answer !== item.answer) {
        next.answeredAt = patch.answer ? updatedAt : null
      }
      return next
    })
    await ctx.db.patch(application._id, { items, updatedAt })
    return null
  },
})

export const patchItems = mutation({
  args: {
    applicationId: v.string(),
    patches: v.array(v.object({ itemId: v.string(), patch: v.any() })),
    updatedAt: v.string(),
  },
  handler: async (ctx, { applicationId, patches, updatedAt }) => {
    const application = await getApp(ctx, applicationId)
    if (!application) return null
    const byId = new Map(patches.map(({ itemId, patch }) => [itemId, patch]))
    const items = application.items.map((item) => {
      const patch = byId.get(item.id)
      if (!patch) return item
      const next = { ...item, ...patch, updatedAt }
      if (patch.suggested === false) next.suggestionSource = null
      if ('answer' in patch && patch.answer !== item.answer) {
        next.answeredAt = patch.answer ? updatedAt : null
      }
      return next
    })
    await ctx.db.patch(application._id, { items, updatedAt })
    return null
  },
})

export const addItem = mutation({
  args: {
    applicationId: v.string(),
    item: v.any(),
    updatedAt: v.string(),
  },
  handler: async (ctx, { applicationId, item, updatedAt }) => {
    const application = await getApp(ctx, applicationId)
    if (application) {
      await ctx.db.patch(application._id, {
        items: [...application.items, item],
        updatedAt,
      })
    }
    return null
  },
})

export const addAttachment = mutation({
  args: {
    applicationId: v.string(),
    itemId: v.union(v.string(), v.null()),
    attachment: v.any(),
    updatedAt: v.string(),
  },
  handler: async (ctx, { applicationId, itemId, attachment, updatedAt }) => {
    const application = await getApp(ctx, applicationId)
    if (!application) return null
    if (itemId === null) {
      await ctx.db.patch(application._id, {
        attachments: [...application.attachments, attachment],
        updatedAt,
      })
      return null
    }
    await ctx.db.patch(application._id, {
      items: application.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              attachments: [...item.attachments, attachment],
              updatedAt,
            }
          : item,
      ),
      updatedAt,
    })
    return null
  },
})

export const setAttachmentUploaded = mutation({
  args: {
    applicationId: v.string(),
    attachmentId: v.string(),
    storageId: v.string(),
    updatedAt: v.string(),
  },
  handler: async (ctx, { applicationId, attachmentId, storageId, updatedAt }) => {
    const application = await getApp(ctx, applicationId)
    if (!application) return null
    const update = (attachment: PersistedAttachment) =>
      attachment.id === attachmentId
        ? { ...attachment, storageId, uploadStatus: 'uploaded' as const }
        : attachment
    await ctx.db.patch(application._id, {
      attachments: application.attachments.map(update),
      items: application.items.map((item) => ({
        ...item,
        attachments: item.attachments.map(update),
      })),
      updatedAt,
    })
    return null
  },
})

export const setAttachmentDeletedAt = mutation({
  args: {
    applicationId: v.string(),
    itemId: v.union(v.string(), v.null()),
    attachmentId: v.string(),
    deletedAt: v.union(v.string(), v.null()),
    updatedAt: v.string(),
  },
  handler: async (ctx, { applicationId, itemId, attachmentId, deletedAt, updatedAt }) => {
    const application = await getApp(ctx, applicationId)
    if (!application) return null
    if (itemId === null) {
      await ctx.db.patch(application._id, {
        attachments: application.attachments.map((attachment) =>
          attachment.id === attachmentId ? { ...attachment, deletedAt } : attachment,
        ),
        updatedAt,
      })
      return null
    }
    await ctx.db.patch(application._id, {
      items: application.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              attachments: item.attachments.map((attachment) =>
                attachment.id === attachmentId ? { ...attachment, deletedAt } : attachment,
              ),
              updatedAt,
            }
          : item,
      ),
      updatedAt,
    })
    return null
  },
})

export const purgeAttachment = mutation({
  args: {
    applicationId: v.string(),
    itemId: v.union(v.string(), v.null()),
    attachmentId: v.string(),
  },
  handler: async (ctx, { applicationId, itemId, attachmentId }) => {
    const application = await getApp(ctx, applicationId)
    if (!application) return null

    const source = itemId === null
      ? application.attachments
      : (application.items.find((item) => item.id === itemId)?.attachments ?? [])
    const target = source.find((attachment) => attachment.id === attachmentId)
    if (!target) return null

    if (target.storageId) {
      try {
        await ctx.storage.delete(target.storageId as Id<'_storage'>)
      } catch {
        // já removido
      }
    }

    const drop = (list: PersistedAttachment[]) =>
      list.filter((attachment) => attachment.id !== attachmentId)

    if (itemId === null) {
      await ctx.db.patch(application._id, { attachments: drop(application.attachments) })
    } else {
      await ctx.db.patch(application._id, {
        items: application.items.map((item) =>
          item.id === itemId ? { ...item, attachments: drop(item.attachments) } : item,
        ),
      })
    }
    return null
  },
})

export const setAttachmentUploadStatus = mutation({
  args: {
    applicationId: v.string(),
    attachmentId: v.string(),
    uploadStatus: v.union(v.literal('pending'), v.literal('failed')),
    updatedAt: v.string(),
  },
  handler: async (ctx, { applicationId, attachmentId, uploadStatus, updatedAt }) => {
    const application = await getApp(ctx, applicationId)
    if (!application) return null
    const update = (attachment: PersistedAttachment) =>
      attachment.id === attachmentId ? { ...attachment, uploadStatus } : attachment
    await ctx.db.patch(application._id, {
      attachments: application.attachments.map(update),
      items: application.items.map((item) => ({
        ...item,
        attachments: item.attachments.map(update),
      })),
      updatedAt,
    })
    return null
  },
})

export const updateMeta = mutation({
  args: {
    applicationId: v.string(),
    tagsIds: v.optional(v.array(v.string())),
    date: v.optional(v.string()),
    transcript: v.optional(v.union(v.string(), v.null())),
    status: v.optional(v.union(v.literal('draft'), v.literal('completed'))),
    completedAt: v.optional(v.union(v.string(), v.null())),
    updatedAt: v.string(),
  },
  handler: async (ctx, { applicationId, updatedAt, ...meta }) => {
    const application = await getApp(ctx, applicationId)
    if (application) await ctx.db.patch(application._id, { ...meta, updatedAt })
    return null
  },
})

export const setTagsForMany = mutation({
  args: {
    applicationIds: v.array(v.string()),
    tagsIds: v.array(v.string()),
    updatedAt: v.string(),
  },
  handler: async (ctx, { applicationIds, tagsIds, updatedAt }) => {
    for (const id of applicationIds) {
      const application = await getApp(ctx, id)
      if (application) await ctx.db.patch(application._id, { tagsIds, updatedAt })
    }
    return null
  },
})

export const softDelete = mutation({
  args: { id: v.string(), deletedAt: v.string() },
  handler: async (ctx, { id, deletedAt }) => {
    const application = await getApp(ctx, id)
    if (!application) return
    const allAttachments = [
      ...application.attachments,
      ...application.items.flatMap((item) => item.attachments),
    ]
    for (const attachment of allAttachments) {
      if (!attachment.storageId) continue
      try {
        await ctx.storage.delete(attachment.storageId as Id<'_storage'>)
      } catch {
        // já removido
      }
    }
    await ctx.db.patch(application._id, { deletedAt })
  },
})
