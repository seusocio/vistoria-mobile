import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

export const list = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query('checklists').collect()).filter((checklist) => !checklist.deletedAt)
  },
})

export const findById = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) =>
    (await ctx.db.query('checklists').withIndex('by_external_id', (q) => q.eq('id', id)).first()) ?? null,
})

export const save = mutation({
  args: { id: v.string(), entity: v.any() },
  handler: async (ctx, { id, entity }) => {
    const existing = await ctx.db.query('checklists').withIndex('by_external_id', (q) => q.eq('id', id)).first()
    if (existing) {
      await ctx.db.replace(existing._id, entity)
      return entity
    }
    await ctx.db.insert('checklists', entity)
    return entity
  },
})

export const softDelete = mutation({
  args: { id: v.string(), deletedAt: v.string() },
  handler: async (ctx, { id, deletedAt }) => {
    const checklist = await ctx.db.query('checklists').withIndex('by_external_id', (q) => q.eq('id', id)).first()
    if (checklist) await ctx.db.patch(checklist._id, { deletedAt })
  },
})
