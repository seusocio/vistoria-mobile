import { Application, ApplicationItem, Attachment } from '@/features/application/shared/application.types'
import { Checklist } from '@/features/checklist/shared/checklist.types'
import { generateId } from '@/lib/id'

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

/**
 * Visit-level attachments are no longer only photos: a voice Note's audio is
 * an attachment too. Galleries and the photo viewer must skip it, and every
 * one of them has to use this same filter — the viewer is opened by index
 * into the list the gallery rendered.
 */
export function isVisibleImage(attachment: Attachment, hiddenIds: Record<string, boolean>): boolean {
  return !attachment.deletedAt && !hiddenIds[attachment.id] && !attachment.mimeType?.startsWith('audio/')
}

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

/**
 * `done` is the progress: items declared "sim" (a positive answer). Empty,
 * "não" and não-conforme items are all still pending. `answered` is any answer
 * at all and only tells a draft that was never touched from one in execution.
 * Both are independent of `application.status`, which only says whether the
 * review is finished.
 */
export function getProgress(
  application: Application,
  checklist: Checklist,
): {
  done: number
  answered: number
  total: number
} {
  const total = application.items.length
  const answered = application.items.filter((item) => item.answer).length
  const done = application.items.filter((item) =>
    isItemAnswerComplete(item, checklist),
  ).length
  return { done, answered, total }
}

export type ApplicationDerivedState =
  | 'not_started'
  | 'in_progress'
  | 'completed'

export function getDerivedState(
  application: Application,
  checklist: Checklist,
): ApplicationDerivedState {
  if (application.status === 'completed') return 'completed'
  const { answered } = getProgress(application, checklist)
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
