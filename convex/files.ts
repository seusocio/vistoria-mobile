import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { mutation } from './_generated/server'

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
})

export const remove = mutation({
  args: { storageId: v.string() },
  handler: async (ctx, { storageId }) => {
    try {
      await ctx.storage.delete(storageId as Id<'_storage'>)
    } catch {
      // já removido
    }
    return null
  },
})
