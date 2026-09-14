import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

export const list = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query('tags').collect()).filter((tag) => !tag.deletedAt)
  },
})

export const listAll = query({
  args: {},
  handler: async (ctx) => ctx.db.query('tags').collect(),
})

export const findById = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) =>
    (await ctx.db.query('tags').withIndex('by_external_id', (q) => q.eq('id', id)).first()) ?? null,
})

export const findByNormalizedLabel = query({
  args: { normalizedLabel: v.string() },
  handler: async (ctx, { normalizedLabel }) => {
    const tag = await ctx.db
      .query('tags')
      .withIndex('by_normalized_label', (q) => q.eq('normalizedLabel', normalizedLabel))
      .first()
    return tag && !tag.deletedAt ? tag : null
  },
})

export const create = mutation({
  args: { entity: v.any() },
  handler: async (ctx, { entity }) => {
    const existingById = await ctx.db
      .query('tags')
      .withIndex('by_external_id', (q) => q.eq('id', entity.id))
      .first()
    if (existingById) return existingById

    const existingByLabel = await ctx.db
      .query('tags')
      .withIndex('by_normalized_label', (q) => q.eq('normalizedLabel', entity.normalizedLabel))
      .first()
    if (existingByLabel && !existingByLabel.deletedAt) return existingByLabel

    const documentId = await ctx.db.insert('tags', entity)
    return await ctx.db.get(documentId)
  },
})

export const softDelete = mutation({
  args: { id: v.string(), deletedAt: v.string() },
  handler: async (ctx, { id, deletedAt }) => {
    const tag = await ctx.db.query('tags').withIndex('by_external_id', (q) => q.eq('id', id)).first()
    if (tag) await ctx.db.patch(tag._id, { deletedAt })
  },
})
