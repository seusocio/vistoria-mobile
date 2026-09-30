import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { type RestQueryResult, useIsOnline } from '@/lib/offline-queue'

/**
 * One page of a list endpoint, already mapped into domain entities by the
 * caller. `pageCount` comes from the response's `meta.pagination` — every list
 * endpoint in `openapi.json` returns the same `ListMeta`, so the "is there a
 * next page" decision is the same everywhere and lives here instead of in each
 * feature's rest module.
 */
export interface ListPage<Item> {
  items: Item[]
  pageCount: number
}

/**
 * A `RestQueryResult` the overlay can consume, plus the three things a list
 * view needs to page. Deliberately a superset rather than a new type: the
 * pagination fields are extra properties `useEntityList` never looks at, so the
 * same object goes to the overlay *and* to the view with no adapter between.
 */
export interface RestListResult<Item> extends RestQueryResult<Item[]> {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  /** Safe to call on every `onEndReached`: a no-op when there is no next page, one is already in flight, or the device is offline. */
  fetchNextPage: () => void
}

export interface UseInfiniteListOptions<Item> {
  /**
   * The list's *unpaged* key — the same one an op's `invalidates` returns.
   * `'infinite'` is appended internally, which React Query's prefix matching
   * still matches, so invalidation keeps working without every op having to
   * know this read is paged.
   */
  queryKey: QueryKey
  enabled: boolean
  /** Fetches and maps one page. `page` is 1-based, matching the endpoints' `page` param. */
  fetchPage: (page: number) => Promise<ListPage<Item>>
}

/**
 * The shared infinite-list read: pages a list endpoint and flattens the pages
 * into the single array `useEntityList` overlays pending writes onto.
 *
 * Two things this is careful about, both of which bit the non-paged reads it
 * replaces:
 *
 * - **Identity.** The flattened array is memoized on `data.pages`, which React
 *   Query keeps referentially stable between renders via structural sharing.
 *   Mapping inline in the hook body (what every rest module did before) handed
 *   `useEntityList` a brand-new array on *every* render, which busted its
 *   `useMemo`, every derived `useMemo` downstream, and the `memo()` on every
 *   row — so typing one character in a search box re-rendered every card. See
 *   ADR 0008.
 * - **Offline.** `fetchNextPage` is gated on `useIsOnline`. React Query's
 *   default `networkMode: 'online'` *pauses* a fetch started with no network
 *   instead of rejecting it, which would leave `isFetchingNextPage` true — and
 *   therefore a footer spinner on screen — until the network came back.
 *   Already-fetched pages stay readable offline from the persisted cache.
 */
export function useInfiniteList<Item>({
  queryKey,
  enabled,
  fetchPage,
}: UseInfiniteListOptions<Item>): RestListResult<Item> {
  const isOnline = useIsOnline()
  const query = useInfiniteQuery({
    queryKey: [...queryKey, 'infinite'] as const,
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    // `allPages.length` is how many pages are loaded, so the next one is
    // always that + 1 — the server's `pageCount` is the only stop condition,
    // and an empty page is never requested.
    getNextPageParam: (lastPage, allPages) =>
      allPages.length < lastPage.pageCount ? allPages.length + 1 : undefined,
  })

  const data = useMemo(
    () => query.data?.pages.flatMap((page) => page.items),
    [query.data?.pages],
  )

  const { hasNextPage, isFetchingNextPage } = query
  const canFetchMore = enabled && isOnline && hasNextPage && !isFetchingNextPage
  const fetchNextPage = useCallback(() => {
    if (!canFetchMore) return
    void query.fetchNextPage()
  }, [canFetchMore, query.fetchNextPage])

  return {
    data,
    isFetchedAfterMount: query.isFetchedAfterMount,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  }
}
