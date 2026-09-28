import { useCallback, useMemo } from 'react'
import { tagCreate } from '@/features/tag/shared/tag.ops'
import { useTagsListRestResult } from '@/features/tag/shared/tag.rest'
import { Tag, normalizeTagLabel } from '@/features/tag/shared/tag.types'
import { tagLabelSchema } from '@/features/tag/shared/tag.schema'
import { generateId } from '@/lib/id'
import { resolveTagLabels } from '@/features/tag/shared/tag.utils'
import { enqueueOp, useEntityList } from '@/lib/offline-queue'
import { api } from '../../../../convex/_generated/api'

const EMPTY_TAGS: Tag[] = []
const getTagId = (tag: Tag) => tag.id

export function useTagsCatalog() {
  // Both reads share one REST result — see `useTagsListRestResult`'s doc.
  const tagsRest = useTagsListRestResult()
  const activeTagsData = useEntityList<Tag>(
    api.tags.list,
    {},
    { kind: 'tag', getId: getTagId },
    tagsRest,
  )
  const allTagsData = useEntityList<Tag>(
    api.tags.listAll,
    {},
    { kind: 'tag', getId: getTagId },
    tagsRest,
  )

  const activeTags = useMemo(
    () => (activeTagsData ?? EMPTY_TAGS).filter((tag) => !tag.deletedAt),
    [activeTagsData],
  )
  const tagsById = useMemo(
    () => new Map((allTagsData ?? []).map((tag) => [tag.id, tag])),
    [allTagsData],
  )
  const loading = activeTagsData === undefined || allTagsData === undefined

  /**
   * Resolves with the tag as soon as it is queued, not when the server
   * acknowledges it. Callers (the template picker applies one per label)
   * only need the id to reference it, and awaiting the network here is what
   * used to make "aplicar modelo" hang forever with no connection.
   */
  const createTag = useCallback((label: string) => {
    const result = tagLabelSchema.safeParse(label)
    if (!result.success) {
      return Promise.reject(new Error(result.error.issues[0]?.message))
    }
    const trimmed = result.data
    const normalizedLabel = normalizeTagLabel(trimmed)

    // The server dedupes by normalized label; matching that locally keeps the
    // overlay from showing a duplicate chip for a tag that already exists.
    const existing = allTagsData?.find(
      (tag) => tag.normalizedLabel === normalizedLabel && !tag.deletedAt,
    )
    if (existing) return Promise.resolve(existing)

    const now = new Date().toISOString()
    const entity: Tag = {
      id: generateId('tag_'),
      label: trimmed,
      normalizedLabel,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    enqueueOp(tagCreate, { entity })
    return Promise.resolve(entity)
  }, [allTagsData])

  const resolveLabels = useCallback(
    (tagsIds: string[]) => resolveTagLabels(tagsIds, tagsById),
    [tagsById],
  )

  return { activeTags, tagsById, loading, createTag, resolveLabels }
}
