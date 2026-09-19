import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import { checklistDoc } from './validators'

export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db
      .query('checklists')
      .withIndex('by_deleted_at', (q) => q.eq('deletedAt', null))
      .collect(),
})

export const findById = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const checklist = await ctx.db
      .query('checklists')
      .withIndex('by_external_id', (q) => q.eq('id', id))
      .first()
    return checklist && !checklist.deletedAt ? checklist : null
  },
})

export const save = mutation({
  args: { id: v.string(), entity: checklistDoc },
  handler: async (ctx, { id, entity }) => {
    const existing = await ctx.db
      .query('checklists')
      .withIndex('by_external_id', (q) => q.eq('id', id))
      .first()
    if (existing) {
      await ctx.db.replace('checklists', existing._id, entity)
      return entity
    }
    await ctx.db.insert('checklists', entity)
    return entity
  },
})

export const softDelete = mutation({
  args: { id: v.string(), deletedAt: v.string() },
  handler: async (ctx, { id, deletedAt }) => {
    const checklist = await ctx.db
      .query('checklists')
      .withIndex('by_external_id', (q) => q.eq('id', id))
      .first()
    if (checklist) await ctx.db.patch('checklists', checklist._id, { deletedAt })
  },
})

/**
 * Deletes the checklist and every one of its (not-yet-deleted) applications in
 * one transaction — replaces the client-side loop of one `applications.softDelete`
 * per application followed by `checklists.softDelete`, which was N+1 network
 * round trips and not atomic. Mirrors `applications.softDelete`'s attachment
 * blob cleanup for each application it touches.
 */
export const softDeleteCascade = mutation({
  args: { id: v.string(), deletedAt: v.string() },
  handler: async (ctx, { id, deletedAt }) => {
    const checklist = await ctx.db
      .query('checklists')
      .withIndex('by_external_id', (q) => q.eq('id', id))
      .first()
    if (!checklist) return

    const applications = await ctx.db
      .query('applications')
      .withIndex('by_checklist_id_and_deleted_at', (q) =>
        q.eq('checklistId', id).eq('deletedAt', null),
      )
      .collect()

    for (const application of applications) {
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
      await ctx.db.patch('applications', application._id, { deletedAt })
    }

    await ctx.db.patch('checklists', checklist._id, { deletedAt })
  },
})
