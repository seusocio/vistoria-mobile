import { useQuery } from 'convex/react'
import { useCallback, useMemo } from 'react'
import { Tag } from '@/infra/domain/entities'
import { findOrCreateTagByLabel, resolveTagLabels } from '@/infra/services'
import { api } from '../../convex/_generated/api'

const EMPTY_TAGS: Tag[] = []

export function useTagsCatalog() {
  const activeTagsData = useQuery(api.tags.list) as Tag[] | undefined
  const allTagsData = useQuery(api.tags.listAll) as Tag[] | undefined

  const activeTags = activeTagsData ?? EMPTY_TAGS
  const tagsById = useMemo(
    () => new Map((allTagsData ?? []).map((tag) => [tag.id, tag])),
    [allTagsData],
  )
  const loading = activeTagsData === undefined || allTagsData === undefined

  // Convex reactively refreshes the queries above once the mutation lands.
  const createTag = useCallback(
    (label: string) => findOrCreateTagByLabel(label),
    [],
  )

  const resolveLabels = useCallback(
    (tagsIds: string[]) => resolveTagLabels(tagsIds, tagsById),
    [tagsById],
  )

  return { activeTags, tagsById, loading, createTag, resolveLabels }
}
