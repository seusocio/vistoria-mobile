import { useCallback } from 'react'
import {
  type ListPage,
  type RestListResult,
  useInfiniteList,
} from '@/lib/api/use-infinite-list'
import type { Application } from '@/features/application/shared/application.types'
import type { HistorySortMode } from '@/features/application/shared/application-history.utils'
import {
  getByOrgIdProjectsByProjectIdApplicationGroups as listApplicationGroups,
  getGetByOrgIdProjectsByProjectIdApplicationGroupsQueryKey as getApplicationGroupsQueryKey,
} from '@/lib/api/endpoints/default/default'
import { isRestEnabled } from '@/lib/backend-flags'
import { useSessionStore } from '@/lib/session/session.store'
import { fromApplicationResponse } from './application.mappers'

/**
 * The histórico's read: tag-set groups, already grouped/ordered by the server,
 * with **no `include`** — the endpoint doesn't accept one, and that absence is
 * the point. The flat `/applications` read this replaced had to carry
 * `include=items,attachments` only so the screen could count negative answers
 * itself; those counts are plain `Application` fields
 * (`fromApplicationResponse` maps them), so a card now renders off a payload
 * that holds no item or attachment rows at all.
 *
 * `sort` and `q` are *not* here — they vary per screen state and are passed
 * separately, because with a paged list they have to be the server's job. A
 * client that re-sorts what it has can only order the pages it has already
 * fetched: the server pages in its own order, so the next page is the next N
 * groups in *that* order, and re-sorting the union scatters them through the
 * list instead of appending. Same for `q`: filtering locally searches only the
 * loaded pages, and a short filtered list never reaches the end, so it can
 * never load the pages holding the rest of the matches.
 * - `pageSize=20` groups per page, paged on scroll by `useInfiniteList` — this
 *   read is the one list here that actually pages. `page` is deliberately *not*
 *   in this constant: it belongs to the page fetcher, while these params
 *   identify the list (and therefore the cache entry and the invalidation key).
 * - `applicationsPerGroup=50` is the endpoint's maximum. The card lists the
 *   visits it is given and labels the total from `applicationsCount`, so a
 *   group past 50 visits shows the right number and lists the latest 50.
 */
export const APPLICATION_GROUPS_PARAMS = {
  groupBy: 'tagSet',
  pageSize: '150',
  applicationsPerGroup: '50',
} as const

/**
 * One tag-set group as the histórico reads it. `applications` are core
 * `Application` objects — the endpoint embeds the same schema `/applications`
 * returns, which is why `fromApplicationResponse` is reused verbatim and there
 * is no second entry shape to keep in sync.
 */
export interface ApplicationGroupSnapshot {
  /** Canonical (sorted) tag set. Empty = the untagged group. */
  tagsIds: string[]
  /** Visits in the group *before* `applicationsPerGroup` truncation. */
  applicationsCount: number
  /** Newest first; truncated to `applicationsPerGroup`. */
  applications: Application[]
}

/**
 * The histórico list's key *prefix* — no `sort`/`q`. Those live in their own
 * key segment appended by `useApplicationGroupsRestResult`, deliberately not
 * merged into the params object: React Query matches by prefix, so an op's
 * `invalidates` can return this one key and hit every sort/search variant the
 * user has cached. Folding them into the params here would make this an
 * exact-match key that misses every variant but the default.
 */
export function applicationGroupsQueryKey(
  orgId: string,
  projectId: string,
  checklistId: string,
) {
  return getApplicationGroupsQueryKey(orgId, projectId, {
    ...APPLICATION_GROUPS_PARAMS,
    checklistId,
  })
}

/**
 * The `RestQueryResult` behind the histórico — server-grouped, so the screen
 * gets its groups instead of deriving them from a flat page.
 *
 * Shaped as a `RestQueryResult` like every other read here even though groups
 * aren't an entity the outbox tracks: the container still feeds the embedded
 * applications through `useEntityList`, which is what keeps pending writes
 * visible (see the container for how a pending write falls back to grouping
 * locally).
 */
export interface ApplicationGroupsQuery {
  /** Wire order. Must be what the screen displays — see `APPLICATION_GROUPS_PARAMS`. */
  sort: HistorySortMode
  /** Tag-label search, already debounced by the caller. Empty means no filter. */
  search: string
}

export function useApplicationGroupsRestResult(
  checklistId: string,
  { sort, search }: ApplicationGroupsQuery,
): RestListResult<ApplicationGroupSnapshot> | undefined {
  const activeOrgId = useSessionStore((state) => state.activeOrgId)
  const activeProjectId = useSessionStore((state) => state.activeProjectId)
  const enabled = isRestEnabled('application') && Boolean(activeOrgId && activeProjectId && checklistId)
  const q = search.trim()

  const fetchPage = useCallback(
    async (page: number): Promise<ListPage<ApplicationGroupSnapshot>> => {
      const response = await listApplicationGroups(activeOrgId ?? '', activeProjectId ?? '', {
        ...APPLICATION_GROUPS_PARAMS,
        checklistId,
        sort,
        ...(q ? { q } : {}),
        page: String(page),
      })
      const envelope = response as unknown as {
        data: {
          tagsIds: string[]
          applicationsCount: number
          applications: Record<string, unknown>[]
        }[]
        meta?: { pagination?: { pageCount?: number } }
      }
      return {
        items: envelope.data.map((group) => ({
          tagsIds: group.tagsIds,
          applicationsCount: group.applicationsCount,
          applications: group.applications.map(fromApplicationResponse),
        })),
        // A missing `pageCount` means "don't page any further" rather than
        // "page forever": guessing a next page from a full-looking one would
        // loop against a server that never reports a count.
        pageCount: envelope.meta?.pagination?.pageCount ?? 1,
      }
    },
    [activeOrgId, activeProjectId, checklistId, q, sort],
  )

  const result = useInfiniteList<ApplicationGroupSnapshot>({
    // `{ sort, q }` as its own segment, after the prefix every op invalidates.
    queryKey: [
      ...applicationGroupsQueryKey(activeOrgId ?? '', activeProjectId ?? '', checklistId),
      { sort, q },
    ],
    enabled,
    fetchPage,
  })

  return enabled ? result : undefined
}
