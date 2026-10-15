import { useCallback, useMemo, useState } from 'react'
import type { ApplicationRowEntry } from '@/components/ApplicationRow'
import {
  type ApplicationGroupSnapshot,
  useApplicationGroupsRestResult,
} from '@/features/application/shared/application-groups.rest'
import type { Application } from '@/features/application/shared/application.types'
import {
  groupApplicationsByTagSet,
  type HistorySortMode,
  sortGroupsByTagLabels,
  tagsKey,
} from '@/features/application/shared/application-history.utils'
import { countNegativeAnswers, getProgress } from '@/features/application/shared/application.utils'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import { normalizeApplication } from '@/features/application/shared/normalize-application'
import { useEntityList, useOutbox } from '@/lib/offline-queue'
import { useDebouncedValue } from '@/utils/use-debounced-value'
import { formatBrDateShort } from '@/utils/date'
import { presentHistorySortPicker } from './history-sort-picker'

const getApplicationId = (application: Application) => application.id

const noop = () => {}

/**
 * The pending ops that can change which group an application belongs to, or
 * whether it is in the list at all — a tag edit, a create, a delete. See
 * `hasPendingApplicationWrites`.
 */
const REGROUPING_OP_TYPES = new Set<string>([
  'applications.create',
  'applications.updateMeta',
  'applications.softDelete',
])

export interface UseHistoryGroupsProps {
  checklistId: string
  /** `null` while loading — no groups are built until it is there. */
  checklist: Checklist | null
  resolveLabels: (tagsIds: string[]) => string[]
}

/**
 * The histórico: its search and sort, the server's tag-set groups (or a local
 * re-grouping while a regrouping write is pending), and paging.
 */
export function useHistoryGroups({ checklistId, checklist, resolveLabels }: UseHistoryGroupsProps) {
  // `listByChecklistId` is a filtered list, so the overlay needs to be told
  // which locally-created applications belong in it — otherwise a vistoria
  // created offline under another checklist shows up here too.
  const belongsToChecklist = useCallback(
    (application: Application) => application.checklistId === checklistId,
    [checklistId],
  )
  /**
   * The histórico reads groups, not a flat page: the server keys them on the
   * tag set and embeds the last visits of each, so the screen no longer
   * downloads every item and attachment row in the checklist just to label a
   * card (see `APPLICATION_GROUPS_PARAMS`).
   */
  const [historySearch, setHistorySearch] = useState('')
  const [historySortMode, setHistorySortMode] = useState<HistorySortMode>('numeric')
  const historyHasFilter = historySearch.trim().length > 0 || historySortMode !== 'numeric'
  /**
   * Debounced because it is part of the request (and so of the query key): one
   * fetch per pause instead of one per keystroke. The input itself stays
   * driven by `historySearch`, so typing is never laggy.
   */
  const debouncedSearch = useDebouncedValue(historySearch)

  const applicationGroupsRest = useApplicationGroupsRestResult(checklistId, {
    sort: historySortMode,
    search: debouncedSearch,
  })
  const serverGroups = applicationGroupsRest?.data
  /**
   * The embedded applications, flattened, fed to `useEntityList` as this
   * screen's server half. The groups are a read projection — the outbox tracks
   * *applications* — so flattening is what keeps the overlay working on the
   * only thing it can key on: an entity id. It patches a pending tag edit onto
   * its row and injects a vistoria created offline, exactly as before.
   *
   * Memoized, not built inline: `useEntityList` keys its own `useMemo` on this
   * object's `data` identity, so a fresh `flatMap` every render busted that
   * memo, every derived `useMemo` below it, and the `memo()` on every
   * `ApplicationGroupRow` — one keystroke in the histórico search re-rendered
   * every card in the list (ADR 0008).
   */
  const applicationsRest = useMemo(
    () =>
      applicationGroupsRest && {
        data: serverGroups?.flatMap((group) => group.applications),
        isFetchedAfterMount: applicationGroupsRest.isFetchedAfterMount,
      },
    [applicationGroupsRest?.isFetchedAfterMount, serverGroups],
  )
  const applicationsData = useEntityList<Application>(
    applicationsRest,
    { kind: 'application', getId: getApplicationId, belongs: belongsToChecklist },
  )
  /**
   * Whether the server's own grouping can be trusted for this render. A
   * pending write can move an application between groups (a batch tag edit), add
   * one the server has never seen, or remove one — none of which the server's
   * pre-grouped answer knows about until the queue drains and it re-groups. So
   * with one of those in the outbox the screen re-groups the overlaid flat list
   * with `groupApplicationsByTagSet`, the same function it used before this
   * endpoint existed: one grouping implementation, not a second one that has to
   * agree with the server's key.
   *
   * Only these three ops, not every op of kind `application`. Group membership
   * is the tag set, so answering an item, adding one, or uploading a photo
   * cannot move a row between groups — and the attachment ops in particular sit
   * in the outbox for as long as an upload takes. Keying off the whole kind put
   * the histórico into local-grouping fallback (and stopped it paging) for the
   * entire duration of any photo upload anywhere in the project.
   */
  const hasPendingApplicationWrites = useOutbox((state) =>
    state.items.some((item) => REGROUPING_OP_TYPES.has(item.type)),
  )

  const applications = useMemo(
    () =>
      (applicationsData ?? [])
        .filter((application) => !application.deletedAt)
        .map(normalizeApplication),
    [applicationsData],
  )

  const usingServerGroups = serverGroups !== undefined && !hasPendingApplicationWrites

  const allGroups = useMemo(() => {
    if (!checklist) return []
    const base: ApplicationGroupSnapshot[] = usingServerGroups
        ? serverGroups
        : groupApplicationsByTagSet(applications).map((group) => ({
            tagsIds: group.tagsIds,
            applicationsCount: group.applications.length,
            applications: group.applications,
          }))
    return base.map((group) => ({
      ...group,
      key: tagsKey(group.tagsIds),
      tagLabels: resolveLabels(group.tagsIds),
      entries: group.applications.map((application): ApplicationRowEntry => {
        const { done, total } = getProgress(application, checklist)
        return {
          id: application.id,
          dateLabel: formatBrDateShort(application.date),
          done,
          total,
          negativeCount: countNegativeAnswers(application, checklist),
          status: application.status,
        }
      }),
    }))
  }, [applications, checklist, resolveLabels, serverGroups, usingServerGroups])

  /**
   * Ordering and filtering are the *server's*, not a post-pass over what
   * arrived — with a paged list they have to be. The server pages in the order
   * it was asked for, so page 2 is the next 20 groups in that order; re-sorting
   * the union client-side scattered them through the list instead of appending,
   * which is why a new page appeared at the top. Filtering had the matching
   * bug: a locally filtered list is short, never reaches its end, and so can
   * never load the pages holding the rest of the matches.
   *
   * `sortGroupsByTagLabels` and the label filter survive for the local
   * fallback below, which works on the whole list in memory and has no pages to
   * keep in order.
   */
  const groups = useMemo(() => {
    if (usingServerGroups) return allGroups
    const query = historySearch.trim().toLowerCase()
    const filtered = query
      ? allGroups.filter((group) =>
          group.tagLabels.some((label) => label.toLowerCase().includes(query)),
        )
      : allGroups
    return sortGroupsByTagLabels(filtered, historySortMode)
  }, [allGroups, historySearch, historySortMode, usingServerGroups])

  /**
   * Summed from the groups, not `applications.length`: the flat list is the
   * *embedded* visits, which the server truncates per group, while
   * `applicationsCount` is the real total.
   */
  const applicationsCount = allGroups.reduce((total, group) => total + group.applicationsCount, 0)

  const onOpenHistorySort = useCallback(() => {
    presentHistorySortPicker(setHistorySortMode)
  }, [])

  return {
    /** `undefined` until the list has loaded. */
    applicationsData,
    applications,
    groups,
    applicationsCount,
    historySearch,
    setHistorySearch,
    historySortMode,
    historyHasFilter,
    onOpenHistorySort,
    /**
     * Paging is suppressed while the histórico is showing locally-grouped
     * results: the next page would arrive keyed on the server's grouping and be
     * re-grouped against a flat list that the outbox is still mutating, so a
     * group could appear twice under the same tag set. It resumes the moment
     * the queue drains.
     */
    onEndReached: hasPendingApplicationWrites
      ? noop
      : (applicationGroupsRest?.fetchNextPage ?? noop),
    isLoadingMore: applicationGroupsRest?.isFetchingNextPage ?? false,
  }
}

export type HistoryGroup = ReturnType<typeof useHistoryGroups>['groups'][number]
