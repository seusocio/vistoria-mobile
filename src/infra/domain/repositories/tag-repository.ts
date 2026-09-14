import { Tag } from '../entities'

export interface TagRepository {
  /** active (not logically deleted) tags, for catalog pickers */
  list(): Promise<Tag[]>
  /** every tag, including logically deleted ones, to resolve historical references */
  listAll(): Promise<Tag[]>
  findById(id: string): Promise<Tag | null>
  findByNormalizedLabel(normalizedLabel: string): Promise<Tag | null>
  create(tag: Tag): Promise<Tag>
  softDelete(id: string): Promise<void>
}
