import type { Tag } from '@/features/tag/shared/tag.types'
import { createTag, getListTagsQueryKey, useListTags } from '@/lib/api/endpoints/default/default'
import type { CreateTagBodyOne } from '@/lib/api/models/createTagBodyOne'
import { isRestEnabled } from '@/lib/backend-flags'
import type { RestQueryResult } from '@/lib/offline-queue'
import { useSessionStore } from '@/lib/session/session.store'

/**
 * `pageSize=100` for the same reason as checklists (`checklist.rest.ts`):
 * pagination isn't built, so one page has to be the whole catalog.
 */
export const TAGS_LIST_PARAMS = { pageSize: '100' }

/**
 * The REST `Tag` has no `deletedAt` — there is no delete-tag endpoint (there
 * never was a Convex mutation for it either, only `tags.create`), so a tag
 * this app creates can never come back soft-deleted. `deletedAt` stays in
 * the app's `Tag` type only because `tags.listAll` returns Convex-soft-
 * -deleted rows and the app filters on it; REST has nothing to filter.
 */
function fromTagResponse(raw: Record<string, unknown>): Tag {
  return {
    id: raw.id as string,
    label: raw.label as string,
    normalizedLabel: raw.normalizedLabel as string,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    deletedAt: null,
  }
}

function toCreateTagBody(entity: Tag): CreateTagBodyOne {
  return { id: entity.id, label: entity.label }
}

export function createTagRest(orgId: string, projectId: string, entity: Tag) {
  return createTag(orgId, projectId, toCreateTagBody(entity))
}

export function tagsListQueryKey(orgId: string, projectId: string) {
  return getListTagsQueryKey(orgId, projectId, TAGS_LIST_PARAMS)
}

/**
 * The one `RestQueryResult` behind both of `useTagsCatalog`'s reads
 * (`tags.list` and `tags.listAll` in Convex terms): REST has a single tags
 * list with no active/deleted split (see `fromTagResponse`), so both
 * `useEntityList` calls there read from this same result.
 */
export function useTagsListRestResult(): RestQueryResult<Tag[]> | undefined {
  const activeOrgId = useSessionStore((state) => state.activeOrgId)
  const activeProjectId = useSessionStore((state) => state.activeProjectId)
  const enabled = isRestEnabled('tag') && Boolean(activeOrgId && activeProjectId)
  const query = useListTags(activeOrgId ?? '', activeProjectId ?? '', TAGS_LIST_PARAMS, { query: { enabled } })
  if (!enabled) return undefined
  if (query.data === undefined) return { data: undefined, isFetchedAfterMount: query.isFetchedAfterMount }
  const envelope = query.data as unknown as { data: Record<string, unknown>[] }
  return {
    data: envelope.data.map(fromTagResponse),
    isFetchedAfterMount: query.isFetchedAfterMount,
  }
}
