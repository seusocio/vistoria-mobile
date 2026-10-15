import type { Application, ApplicationItem } from '@/features/application/shared/application.types'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import { applicationMetaSchema } from '@/features/application/shared/application.schema'
import { parseOrThrow } from '@/lib/forms/parse'
import { generateId } from '@/lib/id'

export interface CreateApplicationInput {
  checklistId: string
  tagsIds: string[]
  date: string
}

export function buildApplicationItems(checklist: Checklist): ApplicationItem[] {
  const now = new Date().toISOString()
  return checklist.items
    .filter((item) => !item.deletedAt)
    .map((item) => ({
      id: generateId('aitem_'),
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
}

export function buildApplication(
  input: CreateApplicationInput,
  checklist: Checklist,
): Application {
  parseOrThrow(applicationMetaSchema, {
    tagsIds: input.tagsIds,
    date: input.date,
  })

  const now = new Date().toISOString()
  return {
    id: generateId('application_'),
    checklistId: input.checklistId,
    tagsIds: [...input.tagsIds],
    date: input.date,
    status: 'draft',
    items: buildApplicationItems(checklist),
    attachments: [],
    gallerySourceApplicationId: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    deletedAt: null,
  }
}

function cloneExtraItem(item: ApplicationItem, now: string): ApplicationItem {
  return {
    ...item,
    id: generateId('aitem_'),
    attachments: [],
    tagsIds: [...item.tagsIds],
    suggested: Boolean(item.answer),
    suggestionSource: item.answer ? 'previous_application' : null,
    answeredAt: item.answer ? now : null,
    // A fresh visit starts its own in-progress state - carrying over the
    // previous visit's "em revisão"/"negado" would be misleading here.
    workflowStatus: null,
    createdAt: now,
    updatedAt: now,
  }
}

export interface RepeatedApplicationOverrides {
  tagsIds?: string[]
  date?: string
}

export function buildRepeatedApplication(
  sourceApplication: Application,
  checklist: Checklist,
  overrides: RepeatedApplicationOverrides = {},
): Application {
  const newApplication = buildApplication(
    {
      checklistId: sourceApplication.checklistId,
      tagsIds: overrides.tagsIds ?? sourceApplication.tagsIds,
      date: overrides.date ?? new Date().toISOString(),
    },
    checklist,
  )
  const previousItemsByChecklistItemId = new Map(
    sourceApplication.items
      .filter((item) => item.checklistItemId)
      .map((item) => [item.checklistItemId as string, item]),
  )
  const previousItemsByPosition = new Map(
    sourceApplication.items.map((item) => [item.position, item]),
  )
  const now = new Date().toISOString()
  const items = newApplication.items.map((item) => {
    const previousItem =
      previousItemsByChecklistItemId.get(item.checklistItemId as string) ??
      previousItemsByPosition.get(item.position)
    if (!previousItem) return item
    return {
      ...item,
      tagsIds: [...previousItem.tagsIds],
      ...(previousItem.answer
        ? {
            answer: previousItem.answer,
            note: previousItem.note,
            quantity: previousItem.quantity,
            suggested: true,
            suggestionSource: 'previous_application' as const,
            answeredAt: now,
          }
        : {}),
      updatedAt: now,
    }
  })
  const checklistItemIds = new Set(
    items
      .map((item) => item.checklistItemId)
      .filter((id): id is string => Boolean(id)),
  )
  const checklistPositions = new Set(items.map((item) => item.position))
  const extraItems = sourceApplication.items
    .filter((item) =>
      item.checklistItemId
        ? !checklistItemIds.has(item.checklistItemId)
        : !checklistPositions.has(item.position),
    )
    .map((item) => cloneExtraItem(item, now))
  return {
    ...newApplication,
    items: [...items, ...extraItems],
    attachments: [],
    gallerySourceApplicationId: sourceApplication.id,
    updatedAt: now,
  }
}

/** An item the user adds on the fill screen, outside the checklist template — blank answer, no attachments. */
export function buildAdHocItem(input: { title: string; tagsIds: string[] }, position: number): ApplicationItem {
  const now = new Date().toISOString()
  return {
    id: generateId('aitem_'),
    position,
    checklistItemId: null,
    title: input.title,
    description: '',
    answer: '',
    answeredAt: null,
    note: '',
    quantity: null,
    attachments: [],
    tagsIds: [...input.tagsIds],
    suggested: false,
    suggestionSource: null,
    workflowStatus: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}
