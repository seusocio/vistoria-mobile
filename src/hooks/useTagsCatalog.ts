import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache'
import { useCallback, useMemo } from 'react'
import { Tag, normalizeTagLabel } from '@/infra/domain/entities'
import { generateId } from '@/infra/id'
import { resolveTagLabels } from '@/infra/services'
import { api } from '../../convex/_generated/api'

const EMPTY_TAGS: Tag[] = []

export function useTagsCatalog() {
  const activeTagsData = useQuery(api.tags.list) as Tag[] | undefined
  const allTagsData = useQuery(api.tags.listAll) as Tag[] | undefined
  const createTagMutation = useMutation(api.tags.create).withOptimisticUpdate(
    (store, { entity }) => {
      const tag = entity as Tag
      const active = store.getQuery(api.tags.list, {}) as Tag[] | undefined
      const all = store.getQuery(api.tags.listAll, {}) as Tag[] | undefined
      if (active && !active.some((item) => item.id === tag.id || item.normalizedLabel === tag.normalizedLabel)) {
        store.setQuery(api.tags.list, {}, [tag, ...active] as never)
      }
      if (all && !all.some((item) => item.id === tag.id || item.normalizedLabel === tag.normalizedLabel)) {
        store.setQuery(api.tags.listAll, {}, [tag, ...all] as never)
      }
    },
  )

  const activeTags = activeTagsData ?? EMPTY_TAGS
  const tagsById = useMemo(
    () => new Map((allTagsData ?? []).map((tag) => [tag.id, tag])),
    [allTagsData],
  )
  const loading = activeTagsData === undefined || allTagsData === undefined

  const createTag = useCallback(
    (label: string) => {
      const trimmed = label.trim()
      if (!trimmed) return Promise.reject(new Error('Nome da tag não pode ser vazio'))
      const now = new Date().toISOString()
      return createTagMutation({
        entity: {
          id: generateId('tag_'),
          label: trimmed,
          normalizedLabel: normalizeTagLabel(trimmed),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      }) as Promise<Tag>
    },
    [createTagMutation],
  )

  const resolveLabels = useCallback(
    (tagsIds: string[]) => resolveTagLabels(tagsIds, tagsById),
    [tagsById],
  )

  return { activeTags, tagsById, loading, createTag, resolveLabels }
}
