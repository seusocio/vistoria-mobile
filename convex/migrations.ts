import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { internalMutation } from './_generated/server'

type ApplicationItem = Doc<'applications'>['items'][number]

function isItemUntouched(item: ApplicationItem) {
  return (
    !item.answer &&
    !item.note &&
    item.quantity === null &&
    item.attachments.length === 0 &&
    item.tagsIds.length === 0 &&
    !item.suggested &&
    !item.workflowStatus
  )
}

/**
 * Re-snapshots application.items from their checklist's current items.
 * Only touches applications where every item is still untouched (no
 * answer/note/quantity/attachments/tags) - application-level attachments
 * (the continuous-capture gallery) live on `application.attachments`, not on
 * items, so this never drops photos, even for those it does resync.
 */
export const resyncApplicationItemsFromChecklist = internalMutation({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { force }) => {
    const applications = await ctx.db
      .query('applications')
      .withIndex('by_deleted_at', (q) => q.eq('deletedAt', null))
      .collect()

    let resynced = 0
    let skippedFilled = 0
    let skippedNoChecklist = 0

    for (const application of applications) {
      const checklist = await ctx.db
        .query('checklists')
        .withIndex('by_external_id', (q) =>
          q.eq('id', application.checklistId),
        )
        .first()
      if (!checklist) {
        skippedNoChecklist += 1
        continue
      }

      if (!force && !application.items.every(isItemUntouched)) {
        skippedFilled += 1
        continue
      }

      const now = new Date().toISOString()
      const items = checklist.items
        .filter((item) => !item.deletedAt)
        .map((item, index) => ({
          id: `aitem-resync-${application._id}-${index}`,
          position: item.position,
          checklistItemId: item.id,
          title: item.title,
          description: item.description,
          answer: '',
          answeredAt: null,
          note: '',
          quantity: null,
          attachments: [],
          tagsIds: [...item.tagsIds],
          suggested: false,
          suggestionSource: null,
          workflowStatus: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }))

      await ctx.db.patch('applications', application._id, { items, updatedAt: now })
      resynced += 1
    }

    return {
      resynced,
      skippedFilled,
      skippedNoChecklist,
      total: applications.length,
    }
  },
})

export const backfillChecklistItemIds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const applications = await ctx.db
      .query('applications')
      .withIndex('by_deleted_at', (q) => q.eq('deletedAt', null))
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
        await ctx.db.patch('applications', application._id, { items })
        updatedApplications += 1
      }
    }

    return { updatedApplications, updatedItems }
  },
})
