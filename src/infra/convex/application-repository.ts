import { Application } from '@/infra/domain/entities'
import { ApplicationRepository } from '@/infra/domain/repositories'
import { api } from '../../../convex/_generated/api'
import { castConvex, convexClient } from './client'

function normalize(application: Application): Application {
  return {
    ...application,
    attachments: application.attachments ?? [],
    gallerySourceApplicationId: application.gallerySourceApplicationId ?? null,
    items: application.items.map((item) => ({
      ...item,
      attachments: item.attachments ?? [],
      tagsIds: item.tagsIds ?? [],
      suggestionSource: item.suggestionSource ?? null,
    })),
  }
}

export class ConvexApplicationRepository implements ApplicationRepository {
  async listByChecklistId(checklistId: string): Promise<Application[]> {
    const applications = castConvex<Application[]>(
      await convexClient.query(api.applications.listByChecklistId, { checklistId }),
    )
    return applications.map(normalize)
  }

  async listAll(): Promise<Application[]> {
    const applications = castConvex<Application[]>(
      await convexClient.query(api.applications.listAll, {}),
    )
    return applications.map(normalize)
  }

  async findById(id: string): Promise<Application | null> {
    const application = castConvex<Application | null>(
      await convexClient.query(api.applications.findById, { id }),
    )
    return application ? normalize(application) : null
  }

  async save(application: Application): Promise<Application> {
    const normalized = normalize(application)
    const saved = await convexClient.mutation(api.applications.save, {
      id: normalized.id,
      entity: normalized,
    })
    return normalize(castConvex<Application>(saved))
  }

  async softDelete(id: string): Promise<void> {
    await convexClient.mutation(api.applications.softDelete, {
      id,
      deletedAt: new Date().toISOString(),
    })
  }
}
