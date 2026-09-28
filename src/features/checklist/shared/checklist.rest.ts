import type { ResponseOption } from '@/features/checklist/shared/checklist.types'
import type { Checklist, ChecklistItem } from '@/features/checklist/shared/checklist.types'
import {
  createChecklist,
  deleteChecklist,
  getListChecklistsQueryKey,
  updateChecklist,
  useGetChecklist,
  useListChecklists,
} from '@/lib/api/endpoints/default/default'
import type { CreateChecklistBodyOne } from '@/lib/api/models/createChecklistBodyOne'
import type { UpdateChecklistBodyOne } from '@/lib/api/models/updateChecklistBodyOne'
import { isRestEnabled } from '@/lib/backend-flags'
import type { RestQueryResult } from '@/lib/offline-queue'
import { useSessionStore } from '@/lib/session/session.store'

/**
 * `pageSize=100` for every checklist list read, asserted single-page in dev
 * (ticket #3) rather than implemented as real pagination — the assumption
 * this app makes everywhere else is that an org's checklist count fits one
 * page, and this is the one place that assumption gets checked instead of
 * silently truncating a longer list.
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

/**
 * `pageCount` above 1 means this org has more checklists than fit
 * `CHECKLISTS_LIST_PARAMS.pageSize` — real pagination isn't built, so this
 * fails loudly in dev instead of silently showing a truncated Library.
 */
function assertSinglePage(meta: unknown): void {
  if (process.env.NODE_ENV === 'production') return
  const pagination = (meta as { pagination?: { pageCount?: number } } | undefined)?.pagination
  if (pagination && pagination.pageCount !== 1) {
    throw new Error(
      `checklists: list has ${pagination.pageCount} pages at pageSize=${CHECKLISTS_LIST_PARAMS.pageSize} — pagination isn't implemented`,
    )
  }
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

/** The `RestQueryResult` for the checklist list — see `useChecklistRestResult`. */
export function useChecklistsListRestResult(): RestQueryResult<Checklist[]> | undefined {
  const activeOrgId = useSessionStore((state) => state.activeOrgId)
  const activeProjectId = useSessionStore((state) => state.activeProjectId)
  const enabled = isRestEnabled('checklist') && Boolean(activeOrgId && activeProjectId)
  const query = useListChecklists(activeOrgId ?? '', activeProjectId ?? '', CHECKLISTS_LIST_PARAMS, {
    query: { enabled },
  })

  if (!enabled) return undefined
  if (query.data === undefined) return { data: undefined, isFetchedAfterMount: query.isFetchedAfterMount }
  const envelope = query.data as unknown as { data: Record<string, unknown>[]; meta?: unknown }
  assertSinglePage(envelope.meta)
  return {
    data: envelope.data.map(fromChecklistResponse),
    isFetchedAfterMount: query.isFetchedAfterMount,
  }
}
