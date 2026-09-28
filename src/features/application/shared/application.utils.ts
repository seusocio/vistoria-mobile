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
    group.applications.sort(compareApplicationRecency)
  }
  result.sort((a, b) => compareApplicationRecency(a.applications[0], b.applications[0]))
  return result
}

/**
 * Descending recency: by `date` first, falling back to `createdAt` when two
 * applications share the same `date` (same-day repeat visits, or one edited
 * by hand to match another) - without it, a tie resolves to whichever
 * application happened to come first in the input array instead of the one
 * actually created last.
 */
function compareApplicationRecency(a: Application, b: Application): number {
  const byDate = new Date(b.date).getTime() - new Date(a.date).getTime()
  if (byDate !== 0) return byDate
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

/**
 * The most recent application sharing exactly the given tag set, or null.
 *
 * Same equality as `groupApplicationsByTagSet` (order-insensitive), so
 * picking a tag set that already exists in the histórico finds the very
 * application the group's "repetir" button would have copied from.
 */
export function findLatestApplicationByTagSet(
  applications: Application[],
  tagsIds: string[],
): Application | null {
  if (tagsIds.length === 0) return null
  const key = tagsKey(tagsIds)
  let latest: Application | null = null
  for (const application of applications) {
    if (application.deletedAt) continue
    if (tagsKey(application.tagsIds) !== key) continue
    if (!latest || compareApplicationRecency(application, latest) < 0) {
      latest = application
    }
  }
  return latest
}

export type HistorySortMode = 'recent' | 'alpha' | 'numeric'

const NUMERIC_CHUNK = /(\d+|\D+)/g

/**
 * Natural-order comparator: splits both strings into runs of digits and
 * non-digits and compares digit runs by numeric value instead of character
 * code, so "Bloco 10" sorts after "Bloco 2".
 *
 * Deliberately hand-rolled instead of `localeCompare(..., { numeric: true })`
 * - Hermes (the RN engine) doesn't reliably honor that Intl.Collator option,
 * so on-device it silently fell back to plain string comparison and put
 * "101" before "99" (`'1' < '9'` as characters). This has no Intl dependency,
 * so it behaves the same in tests (Bun/V8) and on-device (Hermes/JSC).
 */
function naturalCompare(a: string, b: string): number {
  const aParts = a.match(NUMERIC_CHUNK) ?? []
  const bParts = b.match(NUMERIC_CHUNK) ?? []
  const length = Math.max(aParts.length, bParts.length)
  for (let i = 0; i < length; i++) {
    const aPart = aParts[i] ?? ''
    const bPart = bParts[i] ?? ''
    if (aPart === bPart) continue
    const aNum = /^\d+$/.test(aPart) ? Number(aPart) : null
    const bNum = /^\d+$/.test(bPart) ? Number(bPart) : null
    if (aNum !== null && bNum !== null) {
      if (aNum !== bNum) return aNum - bNum
      continue
    }
    return aPart < bPart ? -1 : 1
  }
  return 0
}

/**
 * Reorders groups by their tag labels — the only field the histórico's sort
 * picker touches, per the "considere apenas tags" requirement. `recent`
 * leaves `groupApplicationsByTagSet`'s own date order alone; `alpha` does a
 * plain case-insensitive compare of the joined labels, `numeric` runs them
 * through `naturalCompare` instead.
 *
 * Untagged groups have nothing to sort by, so they're pinned to the end
 * regardless of mode rather than landing wherever an empty string collates.
 */
export function sortGroupsByTagLabels<T extends { tagLabels: string[] }>(
  groups: T[],
  mode: HistorySortMode,
): T[] {
  if (mode === 'recent') return groups
  return [...groups].sort((a, b) => {
    const aUntagged = a.tagLabels.length === 0
    const bUntagged = b.tagLabels.length === 0
    if (aUntagged !== bUntagged) return aUntagged ? 1 : -1
    const aLabel = a.tagLabels.join(' ')
    const bLabel = b.tagLabels.join(' ')
    return mode === 'numeric'
      ? naturalCompare(aLabel, bLabel)
      : aLabel.localeCompare(bLabel, 'pt-BR', { sensitivity: 'base' })
  })
}
