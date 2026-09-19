import { Checklist } from '@/infra/domain/entities'
import { ChecklistRepository } from '@/infra/domain/repositories'
import { generateId } from '@/infra/id'
import { checklistRepository } from '@/infra/storage'
import { api } from '../../../convex/_generated/api'
import { convexClient } from '@/infra/convex/client'

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
  const idMap = new Map(existing.items.map((item) => [item.id, generateId('citem_')]))
  const duplicated: Checklist = {
    ...existing,
    id: generateId('checklist_'),
    title: `${existing.title} (cópia)`,
    items: existing.items.map((item, index) => ({
      ...item,
      id: idMap.get(item.id) as string,
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

/**
 * Deletes the checklist and every one of its applications in a single
 * transaction (`checklists.softDeleteCascade`), instead of one
 * `applications.softDelete` round trip per application followed by
 * `checklists.softDelete`.
 */
export async function softDeleteChecklist(id: string): Promise<void> {
  await convexClient.mutation(api.checklists.softDeleteCascade, {
    id,
    deletedAt: new Date().toISOString(),
  })
}
