import { Checklist } from '@/infra/domain/entities'
import { ChecklistRepository } from '@/infra/domain/repositories'
import { api } from '../../../convex/_generated/api'
import { castConvex, convexClient } from './client'

export class ConvexChecklistRepository implements ChecklistRepository {
  async list(): Promise<Checklist[]> {
    return castConvex<Checklist[]>(
      await convexClient.query(api.checklists.list, {}),
    )
  }

  async findById(id: string): Promise<Checklist | null> {
    return castConvex<Checklist | null>(
      await convexClient.query(api.checklists.findById, { id }),
    )
  }

  async save(checklist: Checklist): Promise<Checklist> {
    const saved = await convexClient.mutation(api.checklists.save, {
      id: checklist.id,
      entity: checklist,
    })
    return castConvex<Checklist>(saved)
  }

  async softDelete(id: string): Promise<void> {
    await convexClient.mutation(api.checklists.softDelete, {
      id,
      deletedAt: new Date().toISOString(),
    })
  }
}
