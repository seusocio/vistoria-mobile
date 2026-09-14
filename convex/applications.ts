import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from './_generated/server'

type ApplicationDocument = Doc<'applications'>
type PersistedAttachment = ApplicationDocument['attachments'][number]
type AttachmentWithUrl = PersistedAttachment & { url?: string }
type ApplicationWithUrls = Omit<
  ApplicationDocument,
  'attachments' | 'items'
> & {
  attachments: AttachmentWithUrl[]
  items: Array<
    Omit<ApplicationDocument['items'][number], 'attachments'> & {
      attachments: AttachmentWithUrl[]
    }
  >
}
type StorageContext = QueryCtx | MutationCtx

function withoutImageUrls(entity: ApplicationWithUrls): ApplicationDocument {
  const cleanAttachment = ({ url: _url, ...attachment }: AttachmentWithUrl) =>
    attachment
  return {
    ...entity,
    attachments: entity.attachments.map(cleanAttachment),
    items: entity.items.map((item) => ({
      ...item,
      attachments: item.attachments.map(cleanAttachment),
    })),
  }
}

async function withImageUrls(
  ctx: StorageContext,
  entity: ApplicationDocument,
): Promise<ApplicationWithUrls> {
  const resolveAttachment = async (
    attachment: PersistedAttachment,
  ): Promise<AttachmentWithUrl> => {
    if (!attachment.storageId) return attachment
    const url = await ctx.storage.getUrl(attachment.storageId as Id<'_storage'>)
    return url ? { ...attachment, url } : attachment
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

export const listByChecklistId = query({
  args: { checklistId: v.string() },
  handler: async (ctx, { checklistId }) => {
    const applications = await ctx.db
      .query('applications')
      .withIndex('by_checklist_id', (q) => q.eq('checklistId', checklistId))
      .filter((q) => q.eq(q.field('deletedAt'), null))
      .collect()
    return Promise.all(
      applications.map((application) => withImageUrls(ctx, application)),
    )
  },
})

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const applications = await ctx.db
      .query('applications')
      .filter((q) => q.eq(q.field('deletedAt'), null))
      .collect()
    return Promise.all(
      applications.map((application) => withImageUrls(ctx, application)),
    )
  },
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

export const save = mutation({
  args: { id: v.string(), entity: v.any() },
  handler: async (ctx, { id, entity }) => {
    const storedEntity = withoutImageUrls(entity)
    const existing = await ctx.db
      .query('applications')
      .withIndex('by_external_id', (q) => q.eq('id', id))
      .first()
    if (existing) await ctx.db.replace(existing._id, storedEntity)
    else await ctx.db.insert('applications', storedEntity)
    return withImageUrls(ctx, storedEntity)
  },
})

export const softDelete = mutation({
  args: { id: v.string(), deletedAt: v.string() },
  handler: async (ctx, { id, deletedAt }) => {
    const application = await ctx.db
      .query('applications')
      .withIndex('by_external_id', (q) => q.eq('id', id))
      .first()
    if (application) await ctx.db.patch(application._id, { deletedAt })
  },
})
