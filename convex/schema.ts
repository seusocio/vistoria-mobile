import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { applicationItem, attachment, checklistItem, responseOption } from './validators'

export default defineSchema({
  tags: defineTable({
    id: v.string(),
    label: v.string(),
    normalizedLabel: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
    deletedAt: v.union(v.string(), v.null()),
  })
    .index('by_external_id', ['id'])
    .index('by_normalized_label', ['normalizedLabel'])
    .index('by_deleted_at', ['deletedAt']),
  checklists: defineTable({
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
    .index('by_external_id', ['id'])
    .index('by_deleted_at', ['deletedAt']),
  applications: defineTable({
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
    .index('by_external_id', ['id'])
    .index('by_checklist_id_and_deleted_at', ['checklistId', 'deletedAt'])
    .index('by_deleted_at', ['deletedAt']),
})
