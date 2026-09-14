import { useCallback, useEffect, useState } from 'react'
import { Tag } from '@/infra/domain/entities'
import {
  findOrCreateTagByLabel,
  listActiveTags,
  listAllTagsById,
  resolveTagLabels,
} from '@/infra/services'

export function useTagsCatalog() {
  const [activeTags, setActiveTags] = useState<Tag[]>([])
  const [tagsById, setTagsById] = useState<Map<string, Tag>>(new Map())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [active, byId] = await Promise.all([
      listActiveTags(),
      listAllTagsById(),
    ])
    setActiveTags(active)
    setTagsById(byId)
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const createTag = useCallback(
    async (label: string) => {
      const tag = await findOrCreateTagByLabel(label)
      await refresh()
      return tag
    },
    [refresh],
  )

  const resolveLabels = useCallback(
    (tagsIds: string[]) => resolveTagLabels(tagsIds, tagsById),
    [tagsById],
  )

  return { activeTags, tagsById, loading, refresh, createTag, resolveLabels }
}
