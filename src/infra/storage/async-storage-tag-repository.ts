import { Tag } from '@/infra/domain/entities'
import { TagRepository } from '@/infra/domain/repositories'
import { STORAGE_KEYS } from './keys'
import { readCollection, writeCollection } from './local-collection'

export class AsyncStorageTagRepository implements TagRepository {
  async list(): Promise<Tag[]> {
    const all = await readCollection<Tag>(STORAGE_KEYS.TAGS)
    return all.filter((tag) => !tag.deletedAt)
  }

  async listAll(): Promise<Tag[]> {
    return readCollection<Tag>(STORAGE_KEYS.TAGS)
  }

  async findById(id: string): Promise<Tag | null> {
    const all = await readCollection<Tag>(STORAGE_KEYS.TAGS)
    return all.find((tag) => tag.id === id) ?? null
  }

  async findByNormalizedLabel(normalizedLabel: string): Promise<Tag | null> {
    const all = await readCollection<Tag>(STORAGE_KEYS.TAGS)
    return (
      all.find(
        (tag) => tag.normalizedLabel === normalizedLabel && !tag.deletedAt,
      ) ?? null
    )
  }

  async create(tag: Tag): Promise<Tag> {
    const all = await readCollection<Tag>(STORAGE_KEYS.TAGS)
    all.push(tag)
    await writeCollection(STORAGE_KEYS.TAGS, all)
    return tag
  }

  async softDelete(id: string): Promise<void> {
    const all = await readCollection<Tag>(STORAGE_KEYS.TAGS)
    const index = all.findIndex((tag) => tag.id === id)
    if (index === -1) return
    all[index] = { ...all[index], deletedAt: new Date().toISOString() }
    await writeCollection(STORAGE_KEYS.TAGS, all)
  }
}
