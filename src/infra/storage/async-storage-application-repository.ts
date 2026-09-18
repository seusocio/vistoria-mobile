import { Application } from '@/infra/domain/entities'
import { ApplicationRepository } from '@/infra/domain/repositories'
import { STORAGE_KEYS } from './keys'
import { readCollection, writeCollection } from './local-collection'

export class AsyncStorageApplicationRepository
  implements ApplicationRepository
{
  private normalize(application: Application): Application {
    return {
      ...application,
      attachments: application.attachments ?? [],
      gallerySourceApplicationId:
        application.gallerySourceApplicationId ?? null,
      items: application.items.map((item) => ({
        ...item,
        attachments: item.attachments ?? [],
        tagsIds: item.tagsIds ?? [],
        suggestionSource: item.suggestionSource ?? null,
        workflowStatus: item.workflowStatus ?? null,
      })),
    }
  }

  async listByChecklistId(checklistId: string): Promise<Application[]> {
    const all = await readCollection<Application>(STORAGE_KEYS.APPLICATIONS)
    return all
      .filter(
        (application) =>
          application.checklistId === checklistId && !application.deletedAt,
      )
      .map((application) => this.normalize(application))
  }

  async listAll(): Promise<Application[]> {
    const all = await readCollection<Application>(STORAGE_KEYS.APPLICATIONS)
    return all
      .filter((application) => !application.deletedAt)
      .map((application) => this.normalize(application))
  }

  async findById(id: string): Promise<Application | null> {
    const all = await readCollection<Application>(STORAGE_KEYS.APPLICATIONS)
    const application = all.find((item) => item.id === id)
    return application ? this.normalize(application) : null
  }

  async save(application: Application): Promise<Application> {
    const normalized = this.normalize(application)
    const all = await readCollection<Application>(STORAGE_KEYS.APPLICATIONS)
    const index = all.findIndex((item) => item.id === normalized.id)
    if (index >= 0) {
      all[index] = normalized
    } else {
      all.push(normalized)
    }
    await writeCollection(STORAGE_KEYS.APPLICATIONS, all)
    return normalized
  }

  async softDelete(id: string): Promise<void> {
    const all = await readCollection<Application>(STORAGE_KEYS.APPLICATIONS)
    const index = all.findIndex((application) => application.id === id)
    if (index === -1) return
    all[index] = { ...all[index], deletedAt: new Date().toISOString() }
    await writeCollection(STORAGE_KEYS.APPLICATIONS, all)
  }
}
