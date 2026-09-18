import { v } from 'convex/values'

export const responseOption = v.object({
  label: v.string(),
  semantic: v.union(
    v.literal('positivo'),
    v.literal('negativo'),
    v.literal('neutro'),
  ),
})

export const attachment = v.object({
  id: v.string(),
  name: v.string(),
  position: v.number(),
  createdAt: v.string(),
  deletedAt: v.union(v.string(), v.null()),
  storageId: v.optional(v.string()),
  localUri: v.optional(v.string()),
  uploadStatus: v.optional(
    v.union(v.literal('pending'), v.literal('uploaded'), v.literal('failed')),
  ),
  mimeType: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
})

export const checklistItem = v.object({
  id: v.string(),
  position: v.number(),
  title: v.string(),
  description: v.string(),
  tagsIds: v.array(v.string()),
  /** id of the group/section header item this belongs to; null for top-level items (including the headers themselves) */
  parentId: v.optional(v.union(v.string(), v.null())),
  createdAt: v.string(),
  updatedAt: v.string(),
  deletedAt: v.union(v.string(), v.null()),
})

export const applicationItem = v.object({
  id: v.string(),
  position: v.number(),
  checklistItemId: v.optional(v.union(v.string(), v.null())),
  /** id of the group/section header item this belongs to; null for top-level items (including the headers themselves) */
  parentId: v.optional(v.union(v.string(), v.null())),
  title: v.string(),
  description: v.string(),
  answer: v.string(),
  answeredAt: v.union(v.string(), v.null()),
  note: v.string(),
  quantity: v.union(v.number(), v.null()),
  attachments: v.array(attachment),
  tagsIds: v.array(v.string()),
  suggested: v.boolean(),
  suggestionSource: v.union(
    v.literal('transcript'),
    v.literal('previous_application'),
    v.null(),
  ),
  /**
   * In-progress states derived from "not complete" (item.answer is still the
   * completed/not-completed binary). Optional, like checklistItemId/parentId
   * above, since it was added after existing application items were already
   * stored — old rows simply don't have it yet.
   */
  workflowStatus: v.optional(
    v.union(
      v.literal('in_progress'),
      v.literal('in_review'),
      v.literal('denied'),
      v.null(),
    ),
  ),
  createdAt: v.string(),
  updatedAt: v.string(),
  deletedAt: v.union(v.string(), v.null()),
})

/** Partial patch onto an `applicationItem` — the fields actually mutated by client interactions (answering, notes, quantity, tags, suggestion state). */
export const applicationItemPatch = v.object({
  answer: v.optional(v.string()),
  note: v.optional(v.string()),
  quantity: v.optional(v.union(v.number(), v.null())),
  tagsIds: v.optional(v.array(v.string())),
  suggested: v.optional(v.boolean()),
  suggestionSource: v.optional(
    v.union(
      v.literal('transcript'),
      v.literal('previous_application'),
      v.null(),
    ),
  ),
  workflowStatus: v.optional(
    v.union(
      v.literal('in_progress'),
      v.literal('in_review'),
      v.literal('denied'),
      v.null(),
    ),
  ),
})

export const tagDoc = v.object({
  id: v.string(),
  label: v.string(),
  normalizedLabel: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  deletedAt: v.union(v.string(), v.null()),
})

export const checklistDoc = v.object({
  id: v.string(),
  title: v.string(),
  tagsIds: v.array(v.string()),
  options: v.array(responseOption),
  source: v.union(v.literal('manual'), v.literal('audio_suggestion')),
  items: v.array(checklistItem),
  createdAt: v.string(),
  updatedAt: v.string(),
  deletedAt: v.union(v.string(), v.null()),
})

export const applicationDoc = v.object({
  id: v.string(),
  checklistId: v.string(),
  tagsIds: v.array(v.string()),
  date: v.string(),
  status: v.union(v.literal('draft'), v.literal('completed')),
  items: v.array(applicationItem),
  attachments: v.array(attachment),
  gallerySourceApplicationId: v.union(v.string(), v.null()),
  transcript: v.union(v.string(), v.null()),
  createdAt: v.string(),
  updatedAt: v.string(),
  completedAt: v.union(v.string(), v.null()),
  deletedAt: v.union(v.string(), v.null()),
})
