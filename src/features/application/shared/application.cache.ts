import type { QueryClient } from '@tanstack/react-query'
import type { Application } from '@/features/application/shared/application.types'
import { getApplication } from '@/lib/api/endpoints/default/default'
import { asRecord, fromApplicationResponse } from './application.mappers'
import { APPLICATION_GET_PARAMS, applicationQueryKey } from './application.rest'

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

type RawApplication = Record<string, unknown> & {
  attachments?: Record<string, unknown>[]
  items?: (Record<string, unknown> & { attachments?: Record<string, unknown>[] })[]
}

/**
 * Applies an attachment change to the cached application *synchronously*, in
 * the raw REST shape the cache holds (`f` unwraps a single object, so it's the
 * application itself). Used by the attachment ops' `onServerResponse`: the
 * drain drops the op from the outbox right then, and the overlay stops hiding /
 * showing the attachment — a background `refreshApplicationCache` alone leaves
 * a gap where the stale cache shows a deleted photo again, or hides a new one.
 * Only touches `attachments` arrays, by id, so it can't drift from the shape
 * `fromApplicationResponse` reads. The refresh still runs after, to bring in
 * server-derived fields (signed `url`, counts).
 */
export function patchCachedAttachments(
  queryClient: QueryClient,
  orgId: string,
  projectId: string,
  applicationId: string,
  update: (attachments: Record<string, unknown>[], itemId: string | null) => Record<string, unknown>[],
) {
  queryClient.setQueryData<RawApplication>(applicationQueryKey(orgId, projectId, applicationId), (current) =>
    current
      ? {
          ...current,
          attachments: update(current.attachments ?? [], null),
          items: current.items?.map((item) => ({
            ...item,
            attachments: update(item.attachments ?? [], item.id as string),
          })),
        }
      : current,
  )
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
