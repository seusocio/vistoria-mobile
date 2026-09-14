import {
  Application,
  ApplicationItem,
  Attachment,
  Checklist,
} from '@/infra/domain/entities'
import { ApplicationRepository } from '@/infra/domain/repositories'
import { generateId } from '@/infra/id'
import { applicationRepository } from '@/infra/storage'

export interface CreateApplicationInput {
  checklistId: string
  tagsIds: string[]
  date: string
}

function buildApplicationItems(checklist: Checklist): ApplicationItem[] {
  const now = new Date().toISOString()
  return checklist.items
    .filter((item) => !item.deletedAt)
    .map((item) => ({
      id: generateId('aitem_'),
      position: item.position,
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
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }))
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
    createdAt: now,
    updatedAt: now,
  }
}

export async function createApplication(
  input: CreateApplicationInput,
  checklist: Checklist,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  if (input.tagsIds.length === 0) {
    throw new Error('Selecione ao menos uma tag para a aplicação')
  }
  if (!input.date) {
    throw new Error('Data da visita é obrigatória')
  }

  const now = new Date().toISOString()
  const application: Application = {
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

  return repo.save(application)
}

export async function repeatApplicationWithTags(
  sourceApplication: Application,
  checklist: Checklist,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  const newApplication = await createApplication(
    {
      checklistId: sourceApplication.checklistId,
      tagsIds: sourceApplication.tagsIds,
      date: new Date().toISOString(),
    },
    checklist,
    repo,
  )

  const previousItemsByPosition = new Map(
    sourceApplication.items.map((item) => [item.position, item]),
  )
  const now = new Date().toISOString()
  const items = newApplication.items.map((item) => {
    const previousItem = previousItemsByPosition.get(item.position)
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
  const checklistPositions = new Set(items.map((item) => item.position))
  const extraItems = sourceApplication.items
    .filter((item) => !checklistPositions.has(item.position))
    .map((item) => cloneExtraItem(item, now))

  return repo.save({
    ...newApplication,
    items: [...items, ...extraItems],
    attachments: [],
    gallerySourceApplicationId: sourceApplication.id,
    updatedAt: now,
  })
}

export async function listApplicationsByChecklist(
  checklistId: string,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application[]> {
  return repo.listByChecklistId(checklistId)
}

export async function listAllApplications(
  repo: ApplicationRepository = applicationRepository,
): Promise<Application[]> {
  return repo.listAll()
}

export async function getApplication(
  id: string,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application | null> {
  return repo.findById(id)
}

function touchApplication(application: Application): Application {
  return { ...application, updatedAt: new Date().toISOString() }
}

export async function updateApplicationTags(
  application: Application,
  tagsIds: string[],
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  if (tagsIds.length === 0) {
    throw new Error('A aplicação precisa de ao menos uma tag')
  }
  return repo.save(touchApplication({ ...application, tagsIds }))
}

export async function updateApplicationDate(
  application: Application,
  date: string,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  if (!date) {
    throw new Error('Data da visita é obrigatória')
  }
  return repo.save(touchApplication({ ...application, date }))
}

export interface ApplicationItemPatch {
  answer?: string
  note?: string
  quantity?: number | null
  tagsIds?: string[]
  suggested?: boolean
  suggestionSource?: ApplicationItem['suggestionSource']
}

export async function updateApplicationItem(
  application: Application,
  itemId: string,
  patch: ApplicationItemPatch,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  const now = new Date().toISOString()
  const items = application.items.map((item) => {
    if (item.id !== itemId) return item
    const next = { ...item, ...patch, updatedAt: now }
    if (patch.suggested === false) next.suggestionSource = null
    if ('answer' in patch && patch.answer !== item.answer) {
      next.answeredAt = patch.answer ? now : null
    }
    return next
  })
  return repo.save(touchApplication({ ...application, items }))
}

export interface AddApplicationItemInput {
  title: string
  description?: string
  tagsIds?: string[]
}

export async function addApplicationItem(
  application: Application,
  input: AddApplicationItemInput,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  const title = input.title.trim()
  if (!title) {
    throw new Error('Título do item é obrigatório')
  }
  const now = new Date().toISOString()
  const item: ApplicationItem = {
    id: generateId('aitem_'),
    position: application.items.length,
    title,
    description: input.description?.trim() ?? '',
    answer: '',
    answeredAt: null,
    note: '',
    quantity: null,
    attachments: [],
    tagsIds: input.tagsIds ?? [],
    suggested: false,
    suggestionSource: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  return repo.save(
    touchApplication({ ...application, items: [...application.items, item] }),
  )
}

export async function addAttachment(
  application: Application,
  itemId: string,
  name: string,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  const now = new Date().toISOString()
  const items = application.items.map((item) => {
    if (item.id !== itemId) return item
    const attachment: Attachment = {
      id: generateId('attachment_'),
      name,
      position: item.attachments.length,
      createdAt: now,
      deletedAt: null,
    }
    return {
      ...item,
      attachments: [...item.attachments, attachment],
      updatedAt: now,
    }
  })
  return repo.save(touchApplication({ ...application, items }))
}

export async function removeAttachment(
  application: Application,
  itemId: string,
  attachmentId: string,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  const now = new Date().toISOString()
  const items = application.items.map((item) => {
    if (item.id !== itemId) return item
    return {
      ...item,
      attachments: item.attachments.map((attachment) =>
        attachment.id === attachmentId
          ? { ...attachment, deletedAt: now }
          : attachment,
      ),
      updatedAt: now,
    }
  })
  return repo.save(touchApplication({ ...application, items }))
}
export async function addApplicationAttachment(
  application: Application,
  name: string,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  const now = new Date().toISOString()
  const attachment: Attachment = {
    id: generateId('attachment_'),
    name,
    position: application.attachments.length,
    createdAt: now,
    deletedAt: null,
  }
  return repo.save(
    touchApplication({
      ...application,
      attachments: [...application.attachments, attachment],
    }),
  )
}

export async function removeApplicationAttachment(
  application: Application,
  attachmentId: string,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  const now = new Date().toISOString()
  return repo.save(
    touchApplication({
      ...application,
      attachments: application.attachments.map((attachment) =>
        attachment.id === attachmentId
          ? { ...attachment, deletedAt: now }
          : attachment,
      ),
    }),
  )
}

export async function acceptSuggestion(
  application: Application,
  itemId: string,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  return updateApplicationItem(
    application,
    itemId,
    { suggested: false, suggestionSource: null },
    repo,
  )
}

export async function rejectSuggestion(
  application: Application,
  itemId: string,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  return updateApplicationItem(
    application,
    itemId,
    { suggested: false, suggestionSource: null, answer: '', note: '' },
    repo,
  )
}

export async function acceptAllSuggestions(
  application: Application,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  const now = new Date().toISOString()
  const items = application.items.map((item) =>
    item.suggested
      ? { ...item, suggested: false, suggestionSource: null, updatedAt: now }
      : item,
  )
  return repo.save(touchApplication({ ...application, items }))
}

export async function rejectAllSuggestions(
  application: Application,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  const now = new Date().toISOString()
  const items = application.items.map((item) =>
    item.suggested
      ? {
          ...item,
          suggested: false,
          suggestionSource: null,
          answer: '',
          answeredAt: null,
          note: '',
          updatedAt: now,
        }
      : item,
  )
  return repo.save(touchApplication({ ...application, items }))
}

export async function setTranscript(
  application: Application,
  transcript: string,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  return repo.save(touchApplication({ ...application, transcript }))
}

export async function completeApplication(
  application: Application,
  repo: ApplicationRepository = applicationRepository,
): Promise<Application> {
  const now = new Date().toISOString()
  return repo.save({
    ...application,
    status: 'completed',
    completedAt: now,
    updatedAt: now,
  })
}

export async function removeApplication(
  applicationId: string,
  repo: ApplicationRepository = applicationRepository,
): Promise<void> {
  const exists = await repo.findById(applicationId)
  if (!exists) return

  await repo.softDelete(applicationId)
}

// ---- Derived / read helpers ----

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
