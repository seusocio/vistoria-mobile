import {
  addApplicationAttachment,
  addApplicationItem,
  createApplication,
  deleteApplication,
  deleteAttachment,
  getGetApplicationQueryKey,
  getListApplicationsQueryKey,
  listApplications,
  updateApplication,
  updateApplicationItem,
  updateAttachment,
  useGetApplication,
  useListApplications,
} from '@/lib/api/endpoints/default/default'
import type {
  Application,
  ApplicationItem,
  Attachment,
} from '@/features/application/shared/application.types'
import type { UpdateAttachmentBodyOne } from '@/lib/api/models/updateAttachmentBodyOne'
import { ApiError } from '@/lib/api/fetcher'
import { isRestEnabled } from '@/lib/backend-flags'
import type { RestQueryResult } from '@/lib/offline-queue'
import { useSessionStore } from '@/lib/session/session.store'
import {
  asRecord,
  fromApplicationResponse,
  fromAttachmentResponse,
  type PatchItemArgs,
  toAddAttachmentBody,
  toAddItemBody,
  toCreateApplicationBody,
  toUpdateApplicationBody,
  toUpdateItemBody,
  type UpdateMetaArgs,
} from './application.mappers'

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
 * True when the server answered that the Visita itself doesn't exist — it was
 * deleted (the server deletes for real, attachments and notes with it). The
 * error text is the only signal: a missing attachment or note on the same
 * routes answers 404 too, with its own message.
 */
export function isApplicationGone(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 404) return false
  return (error.body as { error?: unknown } | null | undefined)?.error === 'aplicação não encontrada'
}

export function createApplicationRest(orgId: string, projectId: string, entity: Application) {
  return createApplication(orgId, projectId, toCreateApplicationBody(entity))
}

export function deleteApplicationRest(orgId: string, projectId: string, id: string) {
  return deleteApplication(orgId, projectId, id)
}

export function updateApplicationMetaRest(orgId: string, projectId: string, args: UpdateMetaArgs) {
  return updateApplication(orgId, projectId, args.applicationId, toUpdateApplicationBody(args))
}

export function addApplicationItemRest(
  orgId: string,
  projectId: string,
  applicationId: string,
  item: ApplicationItem,
) {
  return addApplicationItem(orgId, projectId, applicationId, toAddItemBody(item))
}

export function updateApplicationItemRest(orgId: string, projectId: string, args: PatchItemArgs) {
  return updateApplicationItem(orgId, projectId, args.itemId, toUpdateItemBody(args))
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
 * Must build the exact same key `useApplicationRestResult` reads from —
 * react-query compares keys by full array contents, so passing `params`
 * here has to mirror whatever that hook passes to `useGetApplication`, or a
 * write's `onServerResponse`/`invalidates` silently targets an orphaned key
 * nothing ever reads.
 */
export function applicationQueryKey(orgId: string, projectId: string, id: string) {
  return getGetApplicationQueryKey(orgId, projectId, id, APPLICATION_GET_PARAMS)
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
