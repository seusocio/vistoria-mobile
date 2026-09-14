import { Checklist } from '@/infra/domain/entities'
import { ChecklistRepository } from '@/infra/domain/repositories'
import { STORAGE_KEYS } from './keys'
import { readCollection, writeCollection } from './local-collection'

export class AsyncStorageChecklistRepository implements ChecklistRepository {
  async list(): Promise<Checklist[]> {
    const all = await readCollection<Checklist>(STORAGE_KEYS.CHECKLISTS)
    return all.filter((checklist) => !checklist.deletedAt)
  }

  async findById(id: string): Promise<Checklist | null> {
    const all = await readCollection<Checklist>(STORAGE_KEYS.CHECKLISTS)
    return all.find((checklist) => checklist.id === id) ?? null
  }

  async save(checklist: Checklist): Promise<Checklist> {
    const all = await readCollection<Checklist>(STORAGE_KEYS.CHECKLISTS)
    const index = all.findIndex((item) => item.id === checklist.id)
    if (index >= 0) {
      all[index] = checklist
    } else {
      all.push(checklist)
    }
    await writeCollection(STORAGE_KEYS.CHECKLISTS, all)
    return checklist
  }

  async softDelete(id: string): Promise<void> {
    const all = await readCollection<Checklist>(STORAGE_KEYS.CHECKLISTS)
    const index = all.findIndex((checklist) => checklist.id === id)
    if (index === -1) return
    all[index] = { ...all[index], deletedAt: new Date().toISOString() }
    await writeCollection(STORAGE_KEYS.CHECKLISTS, all)
  }
}
