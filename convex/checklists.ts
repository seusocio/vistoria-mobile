import { v } from 'convex/values'
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
