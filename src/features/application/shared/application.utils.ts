import { Application, ApplicationItem, Attachment } from '@/features/application/shared/application.types'
import { Checklist } from '@/features/checklist/shared/checklist.types'
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
    transcript: null,
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

export function buildRepeatedApplication(
  sourceApplication: Application,
  checklist: Checklist,
): Application {
  const newApplication = buildApplication(
    {
      checklistId: sourceApplication.checklistId,
      tagsIds: sourceApplication.tagsIds,
      date: new Date().toISOString(),
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

export interface ApplicationItemPatch {
  answer?: string
  note?: string
  quantity?: number | null
  tagsIds?: string[]
  suggested?: boolean
  suggestionSource?: ApplicationItem['suggestionSource']
  workflowStatus?: ApplicationItem['workflowStatus']
}

export function applyApplicationItemPatch(
  application: Application,
  itemId: string,
  patch: ApplicationItemPatch,
  updatedAt: string,
): Application {
  const items = application.items.map((item) => {
    if (item.id !== itemId) return item
    const next = { ...item, ...patch, updatedAt }
    if (patch.suggested === false) next.suggestionSource = null
    if ('answer' in patch && patch.answer !== item.answer) {
      next.answeredAt = patch.answer ? updatedAt : null
    }
    return next
  })
  return { ...application, items, updatedAt }
}

export interface AttachmentInput {
  id?: string
  name: string
  storageId?: string
  localUri?: string
  uploadStatus?: Attachment['uploadStatus']
  mimeType?: string
  width?: number
  height?: number
}

export function createAttachment(
  input: AttachmentInput,
  position: number,
  now: string,
): Attachment {
  return {
    id: input.id ?? generateId('attachment_'),
    name: input.name,
    position,
    createdAt: now,
    deletedAt: null,
    ...(input.storageId ? { storageId: input.storageId } : {}),
    ...(input.localUri ? { localUri: input.localUri } : {}),
    ...(input.uploadStatus ? { uploadStatus: input.uploadStatus } : {}),
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
  }
}

// ---- Derived / read helpers ----

export function sortItemsByChecklistOrder(
  items: ApplicationItem[],
  checklist: Checklist,
): ApplicationItem[] {
  const ranks = new Map(checklist.items.map((item, index) => [item.id, index]))
  return items
    .map((item, originalIndex) => ({
      item,
      originalIndex,
      rank: item.checklistItemId
        ? (ranks.get(item.checklistItemId) ?? checklist.items.length)
        : checklist.items.length,
    }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.item.position - b.item.position ||
        a.originalIndex - b.originalIndex,
    )
    .map(({ item }) => item)
}

export function getProgress(application: Application): {
  answered: number
  total: number
} {
  const total = application.items.length
  const answered = application.items.filter((item) => item.answer).length
  return { answered, total }
}

export type ApplicationDerivedState =
  | 'not_started'
  | 'in_progress'
  | 'completed'

export function getDerivedState(
  application: Application,
): ApplicationDerivedState {
  if (application.status === 'completed') return 'completed'
  const { answered } = getProgress(application)
  return answered === 0 ? 'not_started' : 'in_progress'
}

/**
 * Keyed on the checklist object, so a new query result rebuilds the set and a
 * stale one can never be served. isItemAnswerComplete runs once per item per
 * render pass on the fill screen - building this set on every call showed up
 * as hundreds of throwaway Sets per answer tap.
 */
const positiveAnswerLabelsCache = new WeakMap<Checklist, Set<string>>()

function positiveAnswerLabels(checklist: Checklist): Set<string> {
  const cached = positiveAnswerLabelsCache.get(checklist)
  if (cached) return cached
  const labels = new Set(
    checklist.options
      .filter((option) => option.semantic === 'positivo')
      .map((option) => option.label),
  )
  positiveAnswerLabelsCache.set(checklist, labels)
  return labels
}

export function isItemAnswerComplete(
  item: ApplicationItem,
  checklist: Checklist,
): boolean {
  return (
    Boolean(item.answer) && positiveAnswerLabels(checklist).has(item.answer)
  )
}

export interface TitlePrefixGroup<T> {
  /** the shared "Label: " prefix for this group's titles; null for the trailing ungrouped bucket */
  label: string | null
  children: T[]
}

export type ApplicationItemGroup = TitlePrefixGroup<ApplicationItem>

/**
 * Splits items into TickTick-style accordion sections purely from title text:
 * items sharing the same "Label: " prefix (e.g. "Cozinha: Instalação
 * hidráulica") group under that label, in first-seen order. There's no
 * parentId support in the checklist authoring UI yet, so this text-matching
 * heuristic is the only grouping signal available today - items without a
 * "Label: " prefix (ad-hoc items) land in a trailing ungrouped bucket.
 *
 * Generic over any `{ title }` item so both application items and checklist
 * template items (authoring UI) group the same way.
 */
export function groupItemsByTitlePrefix<T extends { title: string }>(
  items: T[],
): TitlePrefixGroup<T>[] {
  const order: string[] = []
  const byLabel = new Map<string, T[]>()
  const ungrouped: T[] = []

  for (const item of items) {
    const separatorIndex = item.title.indexOf(': ')
    if (separatorIndex <= 0) {
      ungrouped.push(item)
      continue
    }
    const label = item.title.slice(0, separatorIndex)
    let group = byLabel.get(label)
    if (!group) {
      group = []
      byLabel.set(label, group)
      order.push(label)
    }
    group.push(item)
  }

  const groups: TitlePrefixGroup<T>[] = order.map((label) => ({
    label,
    children: byLabel.get(label) as T[],
  }))
  if (ungrouped.length > 0) groups.push({ label: null, children: ungrouped })
  return groups
}

export function countNegativeAnswers(
  application: Application,
  checklist: Checklist,
): number {
  const negativeLabels = new Set(
    checklist.options
      .filter((option) => option.semantic === 'negativo')
      .map((option) => option.label),
  )
  return application.items.filter(
    (item) => item.answer && negativeLabels.has(item.answer),
  ).length
}

export interface ApplicationGroup {
  key: string
  tagsIds: string[]
  applications: Application[]
}

function tagsKey(tagsIds: string[]): string {
  return [...tagsIds].sort().join('|')
}

export function groupApplicationsByTagSet(
  applications: Application[],
): ApplicationGroup[] {
  const groups = new Map<string, ApplicationGroup>()
  for (const application of applications) {
    const key = tagsKey(application.tagsIds)
    const existing = groups.get(key)
    if (existing) {
      existing.applications.push(application)
    } else {
      groups.set(key, {
        key,
        tagsIds: application.tagsIds,
        applications: [application],
      })
    }
  }

  const result = Array.from(groups.values())
  for (const group of result) {
    group.applications.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
  }
  result.sort(
    (a, b) =>
      new Date(b.applications[0].date).getTime() -
      new Date(a.applications[0].date).getTime(),
  )
  return result
}
