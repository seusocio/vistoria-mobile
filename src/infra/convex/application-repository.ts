import { Application } from '@/infra/domain/entities'
import { ApplicationRepository } from '@/infra/domain/repositories'
import { api } from '../../../convex/_generated/api'
import { castConvex, convexClient } from './client'
import { normalizeApplication } from './normalize'

export class ConvexApplicationRepository implements ApplicationRepository {
  async listByChecklistId(checklistId: string): Promise<Application[]> {
    const applications = castConvex<Application[]>(
      await convexClient.query(api.applications.listByChecklistId, {
        checklistId,
      }),
    )
    return applications.map(normalizeApplication)
  }

  async listAll(): Promise<Application[]> {
    const applications = castConvex<Application[]>(
      await convexClient.query(api.applications.listAll, {}),
    )
    return applications.map(normalizeApplication)
  }

  async findById(id: string): Promise<Application | null> {
    const application = castConvex<Application | null>(
      await convexClient.query(api.applications.findById, { id }),
    )
    return application ? normalizeApplication(application) : null
  }

  async save(application: Application): Promise<Application> {
    const normalized = normalizeApplication(application)
    await convexClient.mutation(api.applications.create, {
      entity: normalized,
    })
    return normalized
  }

  async softDelete(id: string): Promise<void> {
    await convexClient.mutation(api.applications.softDelete, {
      id,
      deletedAt: new Date().toISOString(),
    })
  }
}
