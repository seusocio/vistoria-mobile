import { internalMutation } from './_generated/server'

export const backfillChecklistItemIds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const applications = await ctx.db
      .query('applications')
      .filter((q) => q.eq(q.field('deletedAt'), null))
      .collect()

    let updatedApplications = 0
    let updatedItems = 0

    for (const application of applications) {
      const checklist = await ctx.db
        .query('checklists')
        .withIndex('by_external_id', (q) =>
          q.eq('id', application.checklistId),
        )
        .first()
      if (!checklist) continue

      const checklistItemIdsByPosition = new Map(
        checklist.items.map((item) => [item.position, item.id]),
      )
      let changed = false
      const items = application.items.map((item) => {
        if (item.checklistItemId !== undefined) return item
        changed = true
        updatedItems += 1
        return {
          ...item,
          checklistItemId: checklistItemIdsByPosition.get(item.position) ?? null,
        }
      })

      if (changed) {
        await ctx.db.patch(application._id, { items })
        updatedApplications += 1
      }
    }

    return { updatedApplications, updatedItems }
  },
})
