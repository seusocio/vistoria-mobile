import type { ResponseOption } from '@/features/checklist/shared/checklist.types'
import type { Checklist, ChecklistItem } from '@/features/checklist/shared/checklist.types'
import { useCallback } from 'react'
import {
  type ListPage,
  type RestListResult,
  useInfiniteList,
} from '@/lib/api/use-infinite-list'
import {
  createChecklist,
  deleteChecklist,
  getListChecklistsQueryKey,
  listChecklists,
  updateChecklist,
  useGetChecklist,
} from '@/lib/api/endpoints/default/default'
import type { CreateChecklistBodyOne } from '@/lib/api/models/createChecklistBodyOne'
import type { UpdateChecklistBodyOne } from '@/lib/api/models/updateChecklistBodyOne'
import { isRestEnabled } from '@/lib/backend-flags'
import type { RestQueryResult } from '@/lib/offline-queue'
import { useSessionStore } from '@/lib/session/session.store'

/**
 * `pageSize=30` per page, paged on scroll by `useInfiniteList` — this replaces
 * the `pageSize=100` + dev-only `assertSinglePage` guard that stood in for real
 * pagination (ticket #3). `page` is not in here on purpose: these params
 * identify the *list* (and so the cache entry and the invalidation key), while
 * the page number belongs to the page fetcher.
 */
export const CHECKLISTS_LIST_PARAMS = { pageSize: '100' }

/**
 * Orval couldn't unify the checklist item/option response shape across the
 * spec's `One`/`Two`/`Three` example variants, so it fell back to
 * `{ [key: string]: unknown }` for `items`/`options` on every read response.
 * This is the one boundary that casts back out of that into `Checklist` —
 * every other call site keeps the real type.
 */
function toChecklistItem(raw: Record<string, unknown>): ChecklistItem {
  return {
    id: raw.id as string,
    position: raw.position as number,
    title: raw.title as string,
    description: (raw.description as string | undefined) ?? '',
    tagsIds: (raw.tagsIds as string[] | undefined) ?? [],
    parentId: (raw.parentId as string | null | undefined) ?? null,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    deletedAt: (raw.deletedAt as string | null | undefined) ?? null,
  }
}

/** The inverse of `fromChecklistResponse`'s `data` boundary — see `toChecklistItem`. */
export function fromChecklistResponse(raw: Record<string, unknown>): Checklist {
  return {
    id: raw.id as string,
    title: raw.title as string,
    tagsIds: (raw.tagsIds as string[] | undefined) ?? [],
    options: (raw.options as ResponseOption[] | undefined) ?? [],
    source: ((raw.source as Checklist['source'] | null | undefined) ?? 'manual') as Checklist['source'],
    items: ((raw.items as Record<string, unknown>[] | undefined) ?? []).map(toChecklistItem),
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    deletedAt: (raw.deletedAt as string | null | undefined) ?? null,
  }
}

function toChecklistBody(entity: Checklist): CreateChecklistBodyOne {
  return {
    id: entity.id,
    title: entity.title,
    source: entity.source,
    tagsIds: entity.tagsIds,
    options: entity.options,
    items: entity.items.map((item) => ({
      id: item.id,
      position: item.position,
      title: item.title,
      description: item.description,
      tagsIds: item.tagsIds,
      parentId: item.parentId ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      deletedAt: item.deletedAt,
    })),
  }
}

/** Create and update share one request body shape — these are the same function under the two names each call site expects. */
export const toCreateChecklistBody = toChecklistBody
export const toUpdateChecklistBody: (entity: Checklist) => UpdateChecklistBodyOne = toChecklistBody

/**
 * The oneOf-per-content-type split (see the module doc above) means the
 * generated response types are unusable for direct property access — every
 * variant only agrees on the envelope's outer `{ data, meta }` shape, which
 * `f` (the fetcher) has already unwrapped by the time it reaches here.
 */
function asEntityRecord(response: unknown): Record<string, unknown> {
  return response as Record<string, unknown>
}

/**
 * The write half of Seam A: still the plain orval functions, called with a
 * built request body. `checklists.save`'s `onServerResponse` writes this
 * raw, un-normalized return value straight into the same query cache
 * `useGetChecklist` reads from below — keeping the cache in the one shape
 * both paths agree on, instead of `Checklist`-shaping it here and again on
 * every read.
 */
export function createChecklistRest(orgId: string, projectId: string, entity: Checklist) {
  return createChecklist(orgId, projectId, toCreateChecklistBody(entity))
}

export function updateChecklistRest(orgId: string, projectId: string, entity: Checklist) {
  return updateChecklist(orgId, projectId, entity.id, toUpdateChecklistBody(entity))
}

export function deleteChecklistRest(orgId: string, projectId: string, id: string) {
  return deleteChecklist(orgId, projectId, id)
}

export function checklistsListQueryKey(orgId: string, projectId: string) {
  return getListChecklistsQueryKey(orgId, projectId, CHECKLISTS_LIST_PARAMS)
}

/**
 * The `RestQueryResult` for one checklist — `useGetChecklist` is the real
 * orval-generated hook, called unconditionally (rules-of-hooks) with
 * `enabled` gating whether it actually fetches. `undefined` until there's a
 * session to scope the request to, or no id to read yet (the checklist-
 * form's "new" mode) — `useEntity` treats a missing `rest` exactly like an
 * entity whose flag is still off.
 */
export function useChecklistRestResult(id: string | undefined): RestQueryResult<Checklist | null> | undefined {
  const activeOrgId = useSessionStore((state) => state.activeOrgId)
  const activeProjectId = useSessionStore((state) => state.activeProjectId)
  const enabled = isRestEnabled('checklist') && Boolean(activeOrgId && activeProjectId && id)
  const query = useGetChecklist(activeOrgId ?? '', activeProjectId ?? '', id ?? '', { query: { enabled } })
  if (!enabled) return undefined
  return {
    data: query.data === undefined ? undefined : fromChecklistResponse(asEntityRecord(query.data)),
    isFetchedAfterMount: query.isFetchedAfterMount,
  }
}

/**
 * The checklist list read — paged on scroll (`useInfiniteList`), which also
 * gives the Library a stable array identity across renders; see that hook for
 * why mapping inline in the body was a memoization bug.
 */
export function useChecklistsListRestResult(): RestListResult<Checklist> | undefined {
  const activeOrgId = useSessionStore((state) => state.activeOrgId)
  const activeProjectId = useSessionStore((state) => state.activeProjectId)
  const enabled = isRestEnabled('checklist') && Boolean(activeOrgId && activeProjectId)

  const fetchPage = useCallback(
    async (page: number): Promise<ListPage<Checklist>> => {
      const response = await listChecklists(activeOrgId ?? '', activeProjectId ?? '', {
        ...CHECKLISTS_LIST_PARAMS,
        page: String(page),
      })
      const envelope = response as unknown as {
        data: Record<string, unknown>[]
        meta?: { pagination?: { pageCount?: number } }
      }
      return {
        items: envelope.data.map(fromChecklistResponse),
        pageCount: envelope.meta?.pagination?.pageCount ?? 1,
      }
    },
    [activeOrgId, activeProjectId],
  )

  const result = useInfiniteList<Checklist>({
    queryKey: checklistsListQueryKey(activeOrgId ?? '', activeProjectId ?? ''),
    enabled,
    fetchPage,
  })

  return enabled ? result : undefined
}
