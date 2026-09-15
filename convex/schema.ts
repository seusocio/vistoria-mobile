import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const responseOption = v.object({
  label: v.string(),
  semantic: v.union(
    v.literal('positivo'),
    v.literal('negativo'),
    v.literal('neutro'),
  ),
})

const attachment = v.object({
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

const checklistItem = v.object({
  id: v.string(),
  position: v.number(),
  title: v.string(),
  description: v.string(),
  tagsIds: v.array(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
  deletedAt: v.union(v.string(), v.null()),
})

const applicationItem = v.object({
  id: v.string(),
  position: v.number(),
  checklistItemId: v.optional(v.union(v.string(), v.null())),
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
  createdAt: v.string(),
  updatedAt: v.string(),
  deletedAt: v.union(v.string(), v.null()),
})

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
    .index('by_normalized_label', ['normalizedLabel']),
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
  }).index('by_external_id', ['id']),
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
    .index('by_checklist_id', ['checklistId']),
})
