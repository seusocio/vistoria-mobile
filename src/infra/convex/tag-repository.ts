import { Tag } from '@/infra/domain/entities'
import { TagRepository } from '@/infra/domain/repositories'
import { api } from '../../../convex/_generated/api'
import { castConvex, convexClient } from './client'

export class ConvexTagRepository implements TagRepository {
  async list(): Promise<Tag[]> {
    return castConvex<Tag[]>(await convexClient.query(api.tags.list, {}))
  }

  async listAll(): Promise<Tag[]> {
    return castConvex<Tag[]>(await convexClient.query(api.tags.listAll, {}))
  }

  async findById(id: string): Promise<Tag | null> {
    return castConvex<Tag | null>(
      await convexClient.query(api.tags.findById, { id }),
    )
  }

  async findByNormalizedLabel(normalizedLabel: string): Promise<Tag | null> {
    return castConvex<Tag | null>(
      await convexClient.query(api.tags.findByNormalizedLabel, {
        normalizedLabel,
      }),
    )
  }

  async create(tag: Tag): Promise<Tag> {
    const created = await convexClient.mutation(api.tags.create, {
      entity: tag,
    })
    return castConvex<Tag>(created)
  }

  async softDelete(id: string): Promise<void> {
    await convexClient.mutation(api.tags.softDelete, {
      id,
      deletedAt: new Date().toISOString(),
    })
  }
}
