import { normalizeTagLabel, Tag } from '@/infra/domain/entities'
import { TagRepository } from '@/infra/domain/repositories'
import { parseOrThrow, tagLabelSchema } from '@/infra/domain/schemas'
import { generateId } from '@/infra/id'
import { tagRepository } from '@/infra/storage'

export async function listActiveTags(
  repo: TagRepository = tagRepository,
): Promise<Tag[]> {
  return repo.list()
}

export async function listAllTagsById(
  repo: TagRepository = tagRepository,
): Promise<Map<string, Tag>> {
  const all = await repo.listAll()
  return new Map(all.map((tag) => [tag.id, tag]))
}

export function resolveTagLabels(
  tagsIds: string[],
  tagsById: Map<string, Tag>,
): string[] {
  return tagsIds
    .map((id) => tagsById.get(id)?.label)
    .filter((label): label is string => Boolean(label))
}

export async function findOrCreateTagByLabel(
  label: string,
  repo: TagRepository = tagRepository,
): Promise<Tag> {
  const trimmed = parseOrThrow(tagLabelSchema, label)
  const normalizedLabel = normalizeTagLabel(trimmed)
  const now = new Date().toISOString()
  return repo.create({
    id: generateId('tag_'),
    label: trimmed,
    normalizedLabel,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  })
}

export async function softDeleteTag(
  id: string,
  repo: TagRepository = tagRepository,
): Promise<void> {
  await repo.softDelete(id)
}
