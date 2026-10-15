import type { StoreApi } from 'zustand'
import {
  addAttachment,
  setAttachmentUploaded,
  setAttachmentUploadStatus,
} from '@/features/application/shared/attachment.ops'
import { ApiError } from '@/lib/api/fetcher'
import { enqueueOp } from '@/lib/offline-queue'
import { requireActiveProject } from '@/lib/session/require-active-project'
import { presignAttachmentUpload, uploadAttachmentFile } from '../api/uploads'
import { deleteLocalUpload, MissingLocalFileError, rebaseLocalUri } from '../photos/photo-picker'
import { hasPendingFailedStatusOp, isAwaitingAttachmentRow } from './upload-outbox'
import type { UploadJob, UploadState } from './upload-store'

/** The store is passed in rather than imported, so this module and `upload-store.ts` don't require each other. */
type UploadStoreApi = Pick<StoreApi<UploadState>, 'getState' | 'setState'>

const MAX_ATTEMPTS = 3
/** Attachments whose missing server row was already re-created this session. */
const healedRows = new Set<string>()
/** Attachments already marked failed this session — one status op each, not one per attempt. */
const markedFailed = new Set<string>()

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

/** One attempt at getting the blob into storage; resolves to its storage key. */
async function uploadOnce(job: UploadJob, reportProgress: (fraction: number) => void): Promise<string> {
  const { orgId, projectId } = requireActiveProject('upload')
  const presigned = await presignAttachmentUpload(
    orgId,
    projectId,
    job.attachment.id,
    job.attachment.mimeType ?? 'image/jpeg',
  )
  await uploadAttachmentFile(rebaseLocalUri(job.attachment.localUri) ?? '', job.attachment.mimeType, presigned, reportProgress)
  return presigned.key
}

function dropFromQueue(store: UploadStoreApi, attachmentId: string) {
  store.setState((state) => ({
    queue: state.queue.filter((job) => job.attachment.id !== attachmentId),
  }))
}

function isAbandoned(store: UploadStoreApi, attachmentId: string): boolean {
  return Boolean(store.getState().abandoned[attachmentId])
}

function clearAbandoned(store: UploadStoreApi, attachmentId: string) {
  store.setState((state) => {
    const { [attachmentId]: _abandoned, ...abandoned } = state.abandoned
    return { abandoned }
  })
}

export async function processJob(store: UploadStoreApi, job: UploadJob) {
  const attachmentId = job.attachment.id
  store.setState((state) => ({
    inFlight: { ...state.inFlight, [attachmentId]: true },
    progress: { ...state.progress, [attachmentId]: 0 },
  }))

  try {
    let storageKey: string | null = null
    let lastError: unknown
    let lastReportedBucket = 0
    const reportProgress = (fraction: number) => {
      const bucket = Math.round(fraction * 20)
      if (bucket === lastReportedBucket) return
      lastReportedBucket = bucket
      store.setState((state) => ({
        progress: { ...state.progress, [attachmentId]: fraction },
      }))
    }
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        storageKey = await uploadOnce(job, reportProgress)
        break
      } catch (error) {
        lastError = error
        const reason =
          error instanceof ApiError ? `${error.status} ${error.message}` : error instanceof Error ? error.message : String(error)
        store.setState((state) => ({
          errors: { ...state.errors, [attachmentId]: `attempt ${attempt + 1}: ${reason}` },
        }))
        // `presign` answers 404 for an attachment the server has no row for:
        // its `addAttachment` was lost (or was dropped by an earlier build). Retrying can't help — re-create
        // the row through the outbox instead. The job stays queued and
        // `rearmJobsWithRows` releases it once that op drains.
        //
        // Never for an abandoned job: there the 404 is the user's own delete
        // (the photo, or the note that took it along) having landed, and
        // re-creating the row would bring the photo back as an orphan.
        if (isAbandoned(store, attachmentId)) break
        // No file, nothing to retry — fall through to the failure path below.
        if (error instanceof MissingLocalFileError) break
        if (
          error instanceof ApiError &&
          error.status === 404 &&
          !healedRows.has(attachmentId) &&
          !isAwaitingAttachmentRow(attachmentId)
        ) {
          healedRows.add(attachmentId)
          enqueueOp(addAttachment, {
            applicationId: job.applicationId,
            itemId: job.itemId,
            attachment: job.attachment,
            updatedAt: new Date().toISOString(),
          })
          break
        }
        if (attempt < MAX_ATTEMPTS - 1) await wait(2 ** attempt * 1000)
      }
    }
    if (isAbandoned(store, attachmentId)) {
      // The attachment row (and whatever storage it points to) is deleted by
      // the `deleteAttachment` op the undo-toast's `onCommit` already
      // enqueued, so there is nothing left to clean up here.
      clearAbandoned(store, attachmentId)
      dropFromQueue(store, attachmentId)
      return
    }
    if (!storageKey) throw lastError ?? new Error('Não foi possível enviar a foto')

    // Through the outbox: the blob is already in storage at this point, and
    // losing this write would leave the app re-uploading a photo the server
    // already has, forever.
    enqueueOp(setAttachmentUploaded, {
      applicationId: job.applicationId,
      attachmentId,
      storageKey,
      updatedAt: new Date().toISOString(),
    })

    dropFromQueue(store, attachmentId)
    await deleteLocalUpload(job.attachment.localUri)
  } catch (error) {
    const missingFile = error instanceof MissingLocalFileError
    // Cancelled while it was failing: nobody wants this file any more, so
    // there is no status to report and nothing to retry.
    if (isAbandoned(store, attachmentId)) {
      clearAbandoned(store, attachmentId)
      dropFromQueue(store, attachmentId)
      return
    }
    // The job stays in the persisted queue — the next recovery pass (or the
    // next launch) picks it up. `blocked` only keeps the drain loop from
    // retrying it immediately, in a tight loop, within this session.
    if (!markedFailed.has(attachmentId) && !hasPendingFailedStatusOp(attachmentId)) {
      markedFailed.add(attachmentId)
      enqueueOp(setAttachmentUploadStatus, {
        applicationId: job.applicationId,
        attachmentId,
        uploadStatus: 'failed',
        updatedAt: new Date().toISOString(),
      })
    }
    store.setState((state) => ({
      blocked: { ...state.blocked, [attachmentId]: true },
    }))
    // A missing file never comes back: keeping the job would only fail it
    // again on every launch. The row stays marked `failed` on the server.
    if (missingFile) dropFromQueue(store, attachmentId)
  } finally {
    store.setState((state) => {
      const { [attachmentId]: _progress, ...progress } = state.progress
      const { [attachmentId]: _inFlight, ...inFlight } = state.inFlight
      return { progress, inFlight }
    })
  }
}

/** Session-only flags kept outside the store, for the outbox debugger. */
export function getUploadJobDebug() {
  return { healedRows: [...healedRows], markedFailed: [...markedFailed] }
}
