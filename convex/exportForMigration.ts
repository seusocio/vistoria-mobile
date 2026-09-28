import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { type QueryCtx, query } from './_generated/server'

/**
 * The read side of `scripts/migrate-convex-to-rest.ts` — the one-off export
 * that moves this deployment's data onto the REST backend.
 *
 * It is deliberately separate from `applications.ts`/`checklists.ts`/`tags.ts`:
 * those queries answer what a *screen* needs (active rows, one checklist at a
 * time), while a migration needs every row plus, for attachments, a download
 * URL for the bytes sitting in Convex file storage — which no app query ever
 * returns for a list.
 *
 * Soft-deleted rows are excluded everywhere. The REST schema has no
 * `deletedAt` on any resource (see the note on `tag.rest.ts`'s
 * `fromTagResponse`), so a tombstone has nowhere to land on the other side —
 * carrying one over would resurrect it as a live row.
 *
 * Applications are exported one at a time (`applicationIds` then
 * `application`) rather than as one list: a single query's result has to fit
 * Convex's response size limit, and an application with a few dozen photos
 * plus every item is already large.
 */

type PersistedAttachment = Doc<'applications'>['attachments'][number]

/**
 * `url` is what the migration actually downloads — a Convex-served URL for
 * the stored file. `null` for an attachment that never finished uploading
 * (no `storageId`), which the script records as skipped rather than failing:
 * the row still migrates, just with no bytes behind it.
 */
type ExportedAttachment = Omit<PersistedAttachment, 'localUri'> & {
  url: string | null
}

async function exportAttachment(
  ctx: QueryCtx,
  attachment: PersistedAttachment,
): Promise<ExportedAttachment> {
  const { localUri: _localUri, ...rest } = attachment
  const url = attachment.storageId
    ? await ctx.storage.getUrl(attachment.storageId as Id<'_storage'>)
    : null
  return { ...rest, url: url ?? null }
}

export const tags = query({
  args: {},
  handler: async (ctx) =>
    ctx.db
      .query('tags')
      .withIndex('by_deleted_at', (q) => q.eq('deletedAt', null))
      .collect(),
})

export const checklists = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('checklists')
      .withIndex('by_deleted_at', (q) => q.eq('deletedAt', null))
      .collect()
    return rows.map((checklist) => ({
      ...checklist,
      items: checklist.items.filter((item) => !item.deletedAt),
    }))
  },
})

/**
 * Just the ids, so the script can checkpoint per application and resume a
 * run that died halfway without re-reading every document.
 */
export const applicationIds = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('applications')
      .withIndex('by_deleted_at', (q) => q.eq('deletedAt', null))
      .collect()
    return rows.map((application) => ({
      id: application.id,
      checklistId: application.checklistId,
      updatedAt: application.updatedAt,
    }))
  },
})

export const application = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const found = await ctx.db
      .query('applications')
      .withIndex('by_external_id', (q) => q.eq('id', id))
      .first()
    if (!found || found.deletedAt) return null

    const attachments = await Promise.all(
      found.attachments.filter((a) => !a.deletedAt).map((a) => exportAttachment(ctx, a)),
    )
    const items = await Promise.all(
      found.items
        .filter((item) => !item.deletedAt)
        .map(async (item) => ({
          ...item,
          attachments: await Promise.all(
            item.attachments.filter((a) => !a.deletedAt).map((a) => exportAttachment(ctx, a)),
          ),
        })),
    )
    return { ...found, attachments, items }
  },
})
