import type { QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import {
  type ListPage,
  type RestListResult,
  useInfiniteList,
} from '@/lib/api/use-infinite-list'
import type {
  Application,
  ApplicationItem,
  Attachment,
  UploadStatus,
} from '@/features/application/shared/application.types'
import type { HistorySortMode } from '@/features/application/shared/application.utils'
import {
  addApplicationAttachment,
  addApplicationItem,
  createApplication,
  deleteApplication,
  deleteAttachment,
  getApplication,
  getGetApplicationQueryKey,
  getListApplicationsQueryKey,
  listApplications,
  updateApplication,
  updateApplicationItem,
  updateAttachment,
  getByOrgIdProjectsByProjectIdApplicationGroups as listApplicationGroups,
  getGetByOrgIdProjectsByProjectIdApplicationGroupsQueryKey as getApplicationGroupsQueryKey,
  useGetApplication,
  useListApplications,
} from '@/lib/api/endpoints/default/default'
import type { AddApplicationAttachmentBodyOne } from '@/lib/api/models/addApplicationAttachmentBodyOne'
import type { AddApplicationItemBodyOne } from '@/lib/api/models/addApplicationItemBodyOne'
import type { CreateApplicationBodyOne } from '@/lib/api/models/createApplicationBodyOne'
import type { UpdateApplicationBodyOne } from '@/lib/api/models/updateApplicationBodyOne'
import type { UpdateApplicationItemBodyOne } from '@/lib/api/models/updateApplicationItemBodyOne'
import type { UpdateAttachmentBodyOne } from '@/lib/api/models/updateAttachmentBodyOne'
import { isRestEnabled } from '@/lib/backend-flags'
import type { RestQueryResult } from '@/lib/offline-queue'
import { useSessionStore } from '@/lib/session/session.store'

/**
 * `include` is a comma-separated list of relations to embed, and the server
 * embeds *only* what is listed: `include=items` comes back with
 * `attachments: []` on the application and on every item, however many photos
 * the row actually has (`attachmentsCount` still reports the real number —
 * verified live). Omitting `attachments` here is what made photo previews
 * never appear: every server read blanked them, so a photo was only ever
 * visible through its own pending `addAttachment` op in the overlay, and
 * vanished the moment that op drained.
 *
 * Every read of an application has to pass the same value, which is why it is
 * this one constant — `applicationQueryKey` builds React Query's key out of
 * these params, so a call site with a different `include` reads (and writes) a
 * different cache entry.
 */
export const APPLICATION_INCLUDE = 'items,attachments'

/** The query params shared by both single-application reads (`useGetApplication`) and `refreshApplicationCache`'s direct fetch. */
export const APPLICATION_GET_PARAMS = { include: APPLICATION_INCLUDE }

/**
 * `pageSize=100` — same reasoning as checklists/tags: pagination isn't
 * built, so one page has to be the whole result.
 */
export const APPLICATIONS_LIST_PARAMS = { pageSize: '100', include: APPLICATION_INCLUDE }

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

const UPLOAD_STATUSES: readonly UploadStatus[] = ['pending', 'uploaded', 'failed']

function toUploadStatus(raw: string): UploadStatus {
  return (UPLOAD_STATUSES as readonly string[]).includes(raw) ? (raw as UploadStatus) : 'uploaded'
}

/** The read-side normalizer for one attachment, shared by the application/item read mappers below and by the attachment write helpers (`addAttachmentRest` reads its own response through this same shape). */
function fromAttachmentResponse(raw: Record<string, unknown>): Attachment {
  return {
    id: raw.id as string,
    name: raw.name as string,
    position: raw.position as number,
    createdAt: raw.createdAt as string,
    deletedAt: null,
    storageId: (raw.storageKey as string | null | undefined) ?? undefined,
    uploadStatus: toUploadStatus((raw.uploadStatus as string | undefined) ?? 'uploaded'),
    url: (raw.url as string | null | undefined) ?? undefined,
    mimeType: (raw.mimeType as string | null | undefined) ?? undefined,
    width: (raw.width as number | null | undefined) ?? undefined,
    height: (raw.height as number | null | undefined) ?? undefined,
  }
}

function fromItemResponse(raw: Record<string, unknown>): ApplicationItem {
  return {
    id: raw.id as string,
    position: raw.position as number,
    checklistItemId: (raw.checklistItemId as string | null | undefined) ?? null,
    parentId: (raw.parentId as string | null | undefined) ?? null,
    title: raw.title as string,
    description: (raw.description as string | undefined) ?? '',
    answer: (raw.answer as string | undefined) ?? '',
    answeredAt: (raw.answeredAt as string | null | undefined) ?? null,
    note: (raw.note as string | undefined) ?? '',
    quantity: (raw.quantity as number | null | undefined) ?? null,
    attachments: ((raw.attachments as Record<string, unknown>[] | undefined) ?? []).map(
      fromAttachmentResponse,
    ),
    tagsIds: (raw.tagsIds as string[] | undefined) ?? [],
    suggested: (raw.suggested as boolean | undefined) ?? false,
    suggestionSource: (raw.suggestionSource as ApplicationItem['suggestionSource']) ?? null,
    workflowStatus: (raw.workflowStatus as ApplicationItem['workflowStatus']) ?? null,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    deletedAt: null,
  }
}

/** The inverse of `toCreateApplicationBody`/`toUpdateApplicationBody` — see the module doc on `checklist.rest.ts` for why this cast-and-map boundary exists (the same oneOf-per-content-type spec split). */
function fromApplicationResponse(raw: Record<string, unknown>): Application {
  return {
    id: raw.id as string,
    checklistId: raw.checklistId as string,
    tagsIds: (raw.tagsIds as string[] | undefined) ?? [],
    date: raw.date as string,
    status: raw.status as Application['status'],
    items: ((raw.items as Record<string, unknown>[] | undefined) ?? []).map(fromItemResponse),
    attachments: ((raw.attachments as Record<string, unknown>[] | undefined) ?? []).map(
      fromAttachmentResponse,
    ),
    gallerySourceApplicationId: (raw.gallerySourceApplicationId as string | null | undefined) ?? null,
    transcript: (raw.transcript as string | null | undefined) ?? null,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    completedAt: (raw.completedAt as string | null | undefined) ?? null,
    deletedAt: null,
    // First-class fields on the `Application` response schema, not something
    // assembled here — and the only reason a list read can drop `include`:
    // with no items on the wire there is nothing left to count locally. Left
    // undefined when absent rather than defaulted to 0, so a reader can tell
    // "the server says none" from "this payload never carried counts" (a
    // locally created application) and fall back to counting items.
    answeredCount: raw.answeredCount as number | undefined,
    totalCount: raw.totalCount as number | undefined,
    negativeCount: raw.negativeCount as number | undefined,
    attachmentsCount: raw.attachmentsCount as number | undefined,
  }
}

function asRecord(response: unknown): Record<string, unknown> {
  return response as Record<string, unknown>
}

function toCreateApplicationBody(entity: Application): CreateApplicationBodyOne {
  return {
    id: entity.id,
    checklistId: entity.checklistId,
    tagsIds: entity.tagsIds,
    date: entity.date,
    status: entity.status,
    transcript: entity.transcript,
    gallerySourceApplicationId: entity.gallerySourceApplicationId,
    items: entity.items.map((item) => ({
      id: item.id,
      checklistItemId: item.checklistItemId,
      parentId: item.parentId,
      position: item.position,
      title: item.title,
      description: item.description,
      tagsIds: item.tagsIds,
      answer: item.answer,
      answeredAt: item.answeredAt,
      note: item.note,
      quantity: item.quantity,
      suggested: item.suggested,
      suggestionSource: item.suggestionSource,
      workflowStatus: item.workflowStatus,
    })),
  }
}

export function createApplicationRest(orgId: string, projectId: string, entity: Application) {
  return createApplication(orgId, projectId, toCreateApplicationBody(entity))
}

export function deleteApplicationRest(orgId: string, projectId: string, id: string) {
  return deleteApplication(orgId, projectId, id)
}

export interface UpdateMetaArgs {
  applicationId: string
  checklistId: string
  tagsIds?: string[]
  date?: string
  transcript?: string | null
  status?: Application['status']
  updatedAt: string
}

/**
 * `completedAt` isn't in this request body on purpose — `UpdateApplicationBodyOne`
 * doesn't accept it, and every call site that sets it locally
 * (`application-fill.container.ts`'s `handleComplete`) sets it in the same
 * breath as `status: 'completed'`, so the server deriving it from that
 * transition and returning its own value on the next read is equivalent —
 * the local optimistic overlay already shows the caller's value in the
 * meantime.
 */
function toUpdateApplicationBody(args: UpdateMetaArgs): UpdateApplicationBodyOne {
  const body: UpdateApplicationBodyOne = { updatedAt: args.updatedAt }
  if (args.tagsIds !== undefined) body.tagsIds = args.tagsIds
  if (args.date !== undefined) body.date = args.date
  if (args.transcript !== undefined) body.transcript = args.transcript
  if (args.status !== undefined) body.status = args.status
  return body
}

export function updateApplicationMetaRest(orgId: string, projectId: string, args: UpdateMetaArgs) {
  return updateApplication(orgId, projectId, args.applicationId, toUpdateApplicationBody(args))
}

function toAddItemBody(item: ApplicationItem): AddApplicationItemBodyOne {
  return {
    id: item.id,
    checklistItemId: item.checklistItemId,
    parentId: item.parentId,
    position: item.position,
    title: item.title,
    description: item.description,
    tagsIds: item.tagsIds,
    answer: item.answer,
    answeredAt: item.answeredAt,
    note: item.note,
    quantity: item.quantity,
    suggested: item.suggested,
    suggestionSource: item.suggestionSource,
    workflowStatus: item.workflowStatus,
  }
}

export function addApplicationItemRest(
  orgId: string,
  projectId: string,
  applicationId: string,
  item: ApplicationItem,
) {
  return addApplicationItem(orgId, projectId, applicationId, toAddItemBody(item))
}

/**
 * `updateApplicationItem` is a top-level `/application-items/{id}` resource
 * — `id` here is the *item's* id, not the application's; the application it
 * belongs to isn't part of the path or body at all. `patchItem`'s `applyLocal`
 * still needs `applicationId` to find which entity's overlay to patch
 * locally, but the REST call itself never uses it.
 */
export interface PatchItemArgs {
  itemId: string
  answer?: string
  note?: string
  quantity?: number | null
  tagsIds?: string[]
  suggested?: boolean
  suggestionSource?: ApplicationItem['suggestionSource']
  workflowStatus?: ApplicationItem['workflowStatus']
  updatedAt: string
}

function toUpdateItemBody(args: PatchItemArgs): UpdateApplicationItemBodyOne {
  const body: UpdateApplicationItemBodyOne = { updatedAt: args.updatedAt }
  if (args.answer !== undefined) body.answer = args.answer
  if (args.note !== undefined) body.note = args.note
  if (args.quantity !== undefined) body.quantity = args.quantity
  if (args.tagsIds !== undefined) body.tagsIds = args.tagsIds
  if (args.suggested !== undefined) body.suggested = args.suggested
  if (args.suggestionSource !== undefined) body.suggestionSource = args.suggestionSource
  if (args.workflowStatus !== undefined) body.workflowStatus = args.workflowStatus
  return body
}

export function updateApplicationItemRest(orgId: string, projectId: string, args: PatchItemArgs) {
  return updateApplicationItem(orgId, projectId, args.itemId, toUpdateItemBody(args))
}

function toAddAttachmentBody(itemId: string | null, attachment: Attachment): AddApplicationAttachmentBodyOne {
  return {
    attachments: [
      {
        id: attachment.id,
        itemId,
        name: attachment.name,
        mimeType: attachment.mimeType ?? null,
        position: attachment.position,
        width: attachment.width ?? null,
        height: attachment.height ?? null,
      },
    ],
  }
}

/** The endpoint accepts a batch (`attachments: [...]`), but every call site here adds exactly one photo at a time — `f` keeps a list response's `data` as an array even for a batch of one, so the created row is `data[0]`. */
export async function addAttachmentRest(
  orgId: string,
  projectId: string,
  applicationId: string,
  itemId: string | null,
  attachment: Attachment,
): Promise<Attachment> {
  const response = await addApplicationAttachment(orgId, projectId, applicationId, toAddAttachmentBody(itemId, attachment))
  const envelope = response as unknown as { data: Record<string, unknown>[] }
  return fromAttachmentResponse(envelope.data[0])
}

export function deleteAttachmentRest(orgId: string, projectId: string, attachmentId: string) {
  return deleteAttachment(orgId, projectId, attachmentId)
}

export function updateAttachmentUploadStatusRest(
  orgId: string,
  projectId: string,
  attachmentId: string,
  uploadStatus: UpdateAttachmentBodyOne['uploadStatus'],
) {
  return updateAttachment(orgId, projectId, attachmentId, { uploadStatus })
}

/**
 * The upload-recovery scan's server-side source (`upload-store.ts`'s
 * `resumePending`) — a one-shot fetch outside React, so it calls the
 * generated fetcher directly rather than the `useListApplications` hook.
 */
export async function listApplicationsRest(orgId: string, projectId: string): Promise<Application[]> {
  const response = await listApplications(orgId, projectId, APPLICATIONS_LIST_PARAMS)
  const envelope = response as unknown as { data: Record<string, unknown>[] }
  return envelope.data.map(fromApplicationResponse)
}

/**
 * Must build the exact same key `useApplicationRestResult` reads from —
 * react-query compares keys by full array contents, so passing `params`
 * here has to mirror whatever that hook passes to `useGetApplication`, or a
 * write's `onServerResponse`/`invalidates` silently targets an orphaned key
 * nothing ever reads.
 */
export function applicationQueryKey(orgId: string, projectId: string, id: string) {
  return getGetApplicationQueryKey(orgId, projectId, id, APPLICATION_GET_PARAMS)
}

/**
 * A direct fetch-and-overwrite for one application's cache entry, used by ops
 * whose own response is narrower than the entity (`addAttachment`,
 * `deleteAttachment`, the upload-confirmation ops) — same idea as
 * `create`/`updateMeta`'s `onServerResponse`, which already writes a full
 * response straight into this key. `invalidateQueries` alone only *marks* the
 * query stale and asks React Query to refetch it in the background, which
 * depends on that query currently having an active observer and behaving as
 * expected — this fetches unconditionally and overwrites, so the cache is
 * correct the moment this resolves regardless of what's mounted.
 */
export async function refreshApplicationCache(
  queryClient: QueryClient,
  orgId: string,
  projectId: string,
  applicationId: string,
): Promise<void> {
  const response = await getApplication(orgId, projectId, applicationId, APPLICATION_GET_PARAMS)
  queryClient.setQueryData(applicationQueryKey(orgId, projectId, applicationId), response)
}

export function applicationsListAllQueryKey(orgId: string, projectId: string) {
  return getListApplicationsQueryKey(orgId, projectId, APPLICATIONS_LIST_PARAMS)
}

export function applicationsListByChecklistQueryKey(
  orgId: string,
  projectId: string,
  checklistId: string,
) {
  return getListApplicationsQueryKey(orgId, projectId, {
    ...APPLICATIONS_LIST_PARAMS,
    checklistId,
  })
}

/** The `RestQueryResult` for one application — see `checklist.rest.ts`'s `useChecklistRestResult` for the pattern this mirrors. */
export function useApplicationRestResult(id: string | undefined): RestQueryResult<Application | null> | undefined {
  const activeOrgId = useSessionStore((state) => state.activeOrgId)
  const activeProjectId = useSessionStore((state) => state.activeProjectId)
  const enabled = isRestEnabled('application') && Boolean(activeOrgId && activeProjectId && id)
  // `APPLICATION_GET_PARAMS` — same gap as the list endpoint, and it must be
  // the same constant `applicationQueryKey` uses: without `items` a single
  // application comes back with `items: []` regardless of how many it
  // actually has (blanking out application-fill on every fetch not served
  // from a create/update response's own cache write), and without
  // `attachments` every photo is blanked the same way.
  const query = useGetApplication(activeOrgId ?? '', activeProjectId ?? '', id ?? '', APPLICATION_GET_PARAMS, {
    query: { enabled },
  })
  if (!enabled) return undefined
  return {
    data: query.data === undefined ? undefined : fromApplicationResponse(asRecord(query.data)),
    isFetchedAfterMount: query.isFetchedAfterMount,
  }
}

/**
 * The `RestQueryResult` behind every application list read — `checklistId`
 * absent reads every application in the project (`applications.listAll`),
 * present scopes it (`applications.listByChecklistId`), mirroring the two
 * Convex queries that share this one REST endpoint.
 */
export function useApplicationsListRestResult(
  checklistId?: string,
): RestQueryResult<Application[]> | undefined {
  const activeOrgId = useSessionStore((state) => state.activeOrgId)
  const activeProjectId = useSessionStore((state) => state.activeProjectId)
  const enabled = isRestEnabled('application') && Boolean(activeOrgId && activeProjectId)
  const params = checklistId
    ? { ...APPLICATIONS_LIST_PARAMS, checklistId }
    : APPLICATIONS_LIST_PARAMS
  const query = useListApplications(activeOrgId ?? '', activeProjectId ?? '', params, {
    query: { enabled },
  })

  if (!enabled) return undefined
  if (query.data === undefined) return { data: undefined, isFetchedAfterMount: query.isFetchedAfterMount }
  const envelope = query.data as unknown as { data: Record<string, unknown>[] }
  return {
    data: envelope.data.map(fromApplicationResponse),
    isFetchedAfterMount: query.isFetchedAfterMount,
  }
}

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

/**
 * One application with its items **from the persisted cache only** — no fetch,
 * `undefined` when this device has never read it.
 *
 * The offline half of `ensureApplicationRest`: with React Query's default
 * `networkMode: 'online'` a fetch started with no network is *paused*, not
 * rejected, so `await`ing one offline hangs forever rather than failing into a
 * fallback. A caller that has something sensible to do without the answer reads
 * the cache directly instead.
 */
export function readApplicationFromCache(
  queryClient: QueryClient,
  orgId: string,
  projectId: string,
  applicationId: string,
): Application | undefined {
  const cached = queryClient.getQueryData(applicationQueryKey(orgId, projectId, applicationId))
  return cached === undefined ? undefined : fromApplicationResponse(asRecord(cached))
}

/**
 * One application *with its items*, from the cache when it is there and from
 * the server otherwise — `ensureQueryData` writes into the very key
 * `useApplicationRestResult` reads, so a fetch here also warms the fill
 * screen.
 *
 * Exists because "repetir" copies the previous visit's answers, and the
 * histórico's own read no longer carries items (see
 * `APPLICATION_GROUPS_PARAMS`). Offline this resolves from the persisted cache
 * when the application has been opened before, and rejects when it hasn't —
 * the caller decides what a missing source means.
 */
export async function ensureApplicationRest(
  queryClient: QueryClient,
  orgId: string,
  projectId: string,
  applicationId: string,
): Promise<Application> {
  const response = await queryClient.ensureQueryData({
    queryKey: applicationQueryKey(orgId, projectId, applicationId),
    queryFn: () => getApplication(orgId, projectId, applicationId, APPLICATION_GET_PARAMS),
  })
  return fromApplicationResponse(asRecord(response))
}
