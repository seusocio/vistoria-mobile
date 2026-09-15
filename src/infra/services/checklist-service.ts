import {
  Checklist,
  ChecklistItem,
  DEFAULT_RESPONSE_OPTIONS,
  ResponseOption,
} from '@/infra/domain/entities'
import {
  ApplicationRepository,
  ChecklistRepository,
} from '@/infra/domain/repositories'
import { generateId } from '@/infra/id'
import { applicationRepository, checklistRepository } from '@/infra/storage'

export interface ChecklistItemInput {
  id?: string
  title: string
  description?: string
  tagsIds?: string[]
}

export interface CreateChecklistInput {
  title: string
  tagsIds: string[]
  options: ResponseOption[]
  items: ChecklistItemInput[]
}

export interface UpdateChecklistInput {
  title: string
  tagsIds: string[]
  options: ResponseOption[]
  items: ChecklistItemInput[]
}

function buildItem(input: ChecklistItemInput, position: number): ChecklistItem {
  const now = new Date().toISOString()
  return {
    id: generateId('citem_'),
    position,
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    tagsIds: input.tagsIds ?? [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

export async function listChecklists(
  repo: ChecklistRepository = checklistRepository,
): Promise<Checklist[]> {
  return repo.list()
}

export async function getChecklist(
  id: string,
  repo: ChecklistRepository = checklistRepository,
): Promise<Checklist | null> {
  return repo.findById(id)
}

export async function createChecklist(
  input: CreateChecklistInput,
  repo: ChecklistRepository = checklistRepository,
): Promise<Checklist> {
  const title = input.title.trim()
  if (!title) throw new Error('Nome do checklist é obrigatório')

  const validItems = input.items.filter((item) => item.title.trim().length > 0)
  if (validItems.length === 0) {
    throw new Error('O checklist deve ter ao menos um item')
  }

  const now = new Date().toISOString()
  const checklist: Checklist = {
    id: generateId('checklist_'),
    title,
    tagsIds: input.tagsIds,
    options:
      input.options.length > 0 ? input.options : DEFAULT_RESPONSE_OPTIONS,
    source: 'manual',
    items: validItems.map(buildItem),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }

  return repo.save(checklist)
}

export async function updateChecklist(
  id: string,
  input: UpdateChecklistInput,
  repo: ChecklistRepository = checklistRepository,
): Promise<Checklist> {
  const existing = await repo.findById(id)
  if (!existing) throw new Error('Checklist não encontrado')

  const title = input.title.trim()
  if (!title) throw new Error('Nome do checklist é obrigatório')

  const now = new Date().toISOString()
  const existingById = new Map(existing.items.map((item) => [item.id, item]))

  const items: ChecklistItem[] = input.items
    .filter((item) => item.title.trim().length > 0)
    .map((item, index) => {
      const prior = item.id ? existingById.get(item.id) : undefined
      if (prior) {
        return {
          ...prior,
          position: index,
          title: item.title.trim(),
          description: item.description?.trim() ?? prior.description,
          tagsIds: item.tagsIds ?? prior.tagsIds,
          updatedAt: now,
        }
      }
      return buildItem(item, index)
    })

  if (items.length === 0) {
    throw new Error('O checklist deve ter ao menos um item')
  }

  const updated: Checklist = {
    ...existing,
    title,
    tagsIds: input.tagsIds,
    options: input.options.length > 0 ? input.options : existing.options,
    items,
    updatedAt: now,
  }

  return repo.save(updated)
}

export async function reorderChecklistItems(
  checklistId: string,
  from: number,
  to: number,
  repo: ChecklistRepository = checklistRepository,
): Promise<Checklist> {
  const existing = await repo.findById(checklistId)
  if (!existing) throw new Error('Checklist não encontrado')
  if (
    from < 0 ||
    to < 0 ||
    from >= existing.items.length ||
    to >= existing.items.length
  ) {
    throw new Error('Posição de item inválida')
  }

  const items = [...existing.items]
  const [moved] = items.splice(from, 1)
  items.splice(to, 0, moved)
  const updatedAt = new Date().toISOString()
  return repo.save({
    ...existing,
    items: items.map((item, index) => ({ ...item, position: index })),
    updatedAt,
  })
}

export async function duplicateChecklist(
  id: string,
  repo: ChecklistRepository = checklistRepository,
): Promise<Checklist> {
  const existing = await repo.findById(id)
  if (!existing) throw new Error('Checklist não encontrado')

  const now = new Date().toISOString()
  const duplicated: Checklist = {
    ...existing,
    id: generateId('checklist_'),
    title: `${existing.title} (cópia)`,
    items: existing.items.map((item, index) => ({
      ...item,
      id: generateId('citem_'),
      position: index,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }

  return repo.save(duplicated)
}

export async function softDeleteChecklist(
  id: string,
  repo: ChecklistRepository = checklistRepository,
  applicationRepo: ApplicationRepository = applicationRepository,
): Promise<void> {
  const applications = await applicationRepo.listByChecklistId(id)
  await Promise.all(
    applications.map((application) => applicationRepo.softDelete(application.id)),
  )
  await repo.softDelete(id)
}
