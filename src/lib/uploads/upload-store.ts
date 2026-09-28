import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, type AppStateStatus } from 'react-native'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import {
  setAttachmentUploaded,
  setAttachmentUploadStatus,
} from '@/features/application/shared/application.ops'
import { listApplicationsRest } from '@/features/application/shared/application.rest'
import type { Application, Attachment } from '@/features/application/shared/application.types'
import { isRestEnabled } from '@/lib/backend-flags'
import { enqueueOp, useOutbox } from '@/lib/offline-queue'
import { useSessionStore } from '@/lib/session/session.store'
import { api } from '../../../convex/_generated/api'
import { presignAttachmentUpload, uploadAttachmentFile } from '../api/uploads'
import { convexClient } from '../convex/client'
import { deleteLocalUpload } from '../convex/photo-picker'
import { uploadImage } from '../convex/file-storage'

export interface UploadJob {
  applicationId: string
  itemId: string | null
  attachment: Attachment
  uploadUrl?: string
}
interface UploadState {
  progress: Record<string, number>
  inFlight: Record<string, true>
  abandoned: Record<string, true>
  /** Jobs that have not finished yet. Persisted — this is the durable part. */
  queue: UploadJob[]
  /** Failed this session; skipped until the next recovery pass re-arms them. */
  blocked: Record<string, true>
  enqueue: (job: UploadJob) => void
  cancel: (attachmentId: string) => void
  resumePending: () => Promise<void>
}

const MAX_CONCURRENCY = 3
const MAX_ATTEMPTS = 3
let activeWorkers = 0
let recoveryStarted = false

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

function hasPendingUploadedOp(attachmentId: string): boolean {
  return useOutbox
    .getState()
    .items.some(
      (item) =>
        item.type === 'applications.setAttachmentUploaded' &&
        (item.args as { attachmentId?: string }).attachmentId === attachmentId,
    )
}

/**
 * True while this photo's own `addAttachment` op is still sitting in the
 * outbox — i.e. the server does not have its row yet.
 *
 * `POST /uploads/presign` resolves the storage key *from the attachment row*
 * and answers `404 anexo não encontrado` for an id it doesn't know (verified
 * live), so an upload that starts before that op lands fails. Both are
 * enqueued in the same breath by `use-attach-photos.ts`'s `commitAsset`.
 *
 * This deliberately does *not* gate `drainQueue`. Holding the job back until
 * the row exists reads like the obvious fix and is a trap: the outbox is
 * strictly FIFO, so a single unsendable op at its head stops every write
 * behind it indefinitely — and a photo whose `addAttachment` is stuck behind
 * that head would then sit in an upload spinner forever, with no failure to
 * retry and nothing on screen to explain it. Letting the upload attempt and
 * fail is the recoverable shape: the job stays in the persisted queue, the
 * photo shows as failed, and the subscription in
 * `subscribeToUploadRecovery` re-arms it the moment the row does land.
 */
function isAwaitingAttachmentRow(attachmentId: string): boolean {
  if (!isRestEnabled('application')) return false
  return useOutbox
    .getState()
    .items.some(
      (item) =>
        item.type === 'applications.addAttachment' &&
        (item.args as { attachment?: { id?: string } }).attachment?.id === attachmentId,
    )
}

/**
 * Clears the `blocked` mark on every job whose attachment row has since
 * landed, so the next `drainQueue` picks it up. This is what turns "the
 * presign 404'd because the op hadn't drained yet" into a self-healing
 * sequence instead of a photo that stays failed until the next foreground.
 */
function rearmJobsWithRows(): void {
  const { queue, blocked } = useUploadStore.getState()
  const rearmed = queue.filter(
    (job) => blocked[job.attachment.id] && !isAwaitingAttachmentRow(job.attachment.id),
  )
  if (rearmed.length === 0) return
  useUploadStore.setState((state) => {
    const next = { ...state.blocked }
    for (const job of rearmed) delete next[job.attachment.id]
    return { blocked: next }
  })
}

function dropFromQueue(attachmentId: string) {
  useUploadStore.setState((state) => ({
    queue: state.queue.filter((job) => job.attachment.id !== attachmentId),
  }))
}

async function processJob(job: UploadJob) {
  const attachmentId = job.attachment.id
  useUploadStore.setState((state) => ({
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
      useUploadStore.setState((state) => ({
        progress: { ...state.progress, [attachmentId]: fraction },
      }))
    }
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        if (isRestEnabled('application')) {
          const { activeOrgId, activeProjectId } = useSessionStore.getState()
          if (!activeOrgId || !activeProjectId) {
            throw new Error('upload: no active organization/project session')
          }
          const presigned = await presignAttachmentUpload(
            activeOrgId,
            activeProjectId,
            attachmentId,
            job.attachment.mimeType ?? 'image/jpeg',
          )
          await uploadAttachmentFile(job.attachment.localUri ?? '', job.attachment.mimeType, presigned, reportProgress)
          storageKey = presigned.key
        } else {
          storageKey = await uploadImage(job.attachment.localUri ?? '', job.attachment.mimeType, reportProgress, job.uploadUrl)
        }
        break
      } catch (error) {
        lastError = error
        if (attempt < MAX_ATTEMPTS - 1) await wait(2 ** attempt * 1000)
      }
    }
    if (!storageKey) throw lastError ?? new Error('Não foi possível enviar a foto')

    if (useUploadStore.getState().abandoned[attachmentId]) {
      // On Convex, an abandoned upload leaves an orphaned blob only this
      // client knows about — worth an explicit cleanup call. On REST, the
      // attachment row (and whatever storage it points to) is deleted by the
      // `deleteAttachment` op the undo-toast's `onCommit` already enqueued,
      // so there is nothing left to clean up here.
      if (!isRestEnabled('application')) {
        try {
          await convexClient.mutation(api.files.remove, { storageId: storageKey })
        } catch {
          // já removido
        }
      }
      useUploadStore.setState((state) => {
        const { [attachmentId]: _abandoned, ...abandoned } = state.abandoned
        return { abandoned }
      })
      dropFromQueue(attachmentId)
      return
    }

    // Through the outbox: the blob is already in storage at this point, and
    // losing this write would leave the app re-uploading a photo the server
    // already has, forever.
    enqueueOp(setAttachmentUploaded, {
      applicationId: job.applicationId,
      attachmentId,
      storageKey,
      updatedAt: new Date().toISOString(),
    })

    dropFromQueue(attachmentId)
    await deleteLocalUpload(job.attachment.localUri)
  } catch {
    // The job stays in the persisted queue — the next recovery pass (or the
    // next launch) picks it up. `blocked` only keeps the drain loop from
    // retrying it immediately, in a tight loop, within this session.
    enqueueOp(setAttachmentUploadStatus, {
      applicationId: job.applicationId,
      attachmentId,
      uploadStatus: 'failed',
      updatedAt: new Date().toISOString(),
    })
    useUploadStore.setState((state) => ({
      blocked: { ...state.blocked, [attachmentId]: true },
    }))
  } finally {
    useUploadStore.setState((state) => {
      const { [attachmentId]: _progress, ...progress } = state.progress
      const { [attachmentId]: _inFlight, ...inFlight } = state.inFlight
      return { progress, inFlight }
    })
  }
}

function drainQueue() {
  while (activeWorkers < MAX_CONCURRENCY) {
    const state = useUploadStore.getState()
    const next = state.queue.find(
      (job) => !state.inFlight[job.attachment.id] && !state.blocked[job.attachment.id],
    )
    if (!next) return
    // The job stays in `queue` while it runs: the queue is what survives a
    // kill, and a job removed at start time would be lost if the process died
    // mid-upload — the exact window where the local file is the only copy.
    useUploadStore.setState((current) => ({
      inFlight: { ...current.inFlight, [next.attachment.id]: true },
    }))
    activeWorkers += 1
    void processJob(next).finally(() => {
      activeWorkers -= 1
      drainQueue()
    })
  }
}

/**
 * Photo uploads, durable across a process kill.
 *
 * The queue is persisted because the server row is not a reliable index of
 * pending work: a photo taken offline has no row yet (its `addAttachment` is
 * still in the outbox), so `resumePending`'s server scan cannot see it. The
 * blob itself is already durable — `prepareAsset` writes it to
 * `documentDirectory/uploads/` — so persisting the job is what closes the
 * gap between "the file is on disk" and "the app knows it owes an upload".
 */
export const useUploadStore = create<UploadState>()(
  persist(
    (set, get) => ({
      progress: {},
      inFlight: {},
      abandoned: {},
      queue: [],
      blocked: {},
      enqueue: (job) => {
        const state = get()
        if (
          state.inFlight[job.attachment.id] ||
          state.queue.some((queued) => queued.attachment.id === job.attachment.id)
        ) {
          return
        }
        set((current) => ({ queue: [...current.queue, job] }))
        drainQueue()
      },
      cancel: (attachmentId) => {
        set((state) => ({
          queue: state.queue.filter((job) => job.attachment.id !== attachmentId),
          abandoned: { ...state.abandoned, [attachmentId]: true },
        }))
      },
      resumePending: async () => {
        // Re-arm anything that failed earlier in this session before looking
        // for more work: the usual reason an upload failed is the network.
        set({ blocked: {} })
        drainQueue()

        // Second source: rows the server already knows are pending — photos
        // from a session whose local queue was cleared, or from another
        // device. Deduped against the local queue by attachment id, which is
        // the same key `enqueue` dedupes on.
        let applications: Application[]
        try {
          if (isRestEnabled('application')) {
            const { activeOrgId, activeProjectId } = useSessionStore.getState()
            if (!activeOrgId || !activeProjectId) return
            applications = await listApplicationsRest(activeOrgId, activeProjectId)
          } else {
            applications = (await convexClient.query(api.applications.listAll, {})) as Application[]
          }
        } catch {
          return // Offline: the persisted queue above is the whole story.
        }

        for (const application of applications) {
          const candidates: Array<{ itemId: string | null; attachment: Attachment }> = [
            ...application.attachments.map((attachment) => ({ itemId: null, attachment })),
            ...application.items.flatMap((item) =>
              item.attachments.map((attachment) => ({ itemId: item.id, attachment })),
            ),
          ]
          for (const { itemId, attachment } of candidates) {
            // `localUri` is what makes a row actionable — there is nothing to
            // re-upload without a file on this device — and a REST read never
            // carries one, so on REST this second source finds nothing and the
            // persisted queue above is the whole story. Kept for the Convex
            // path, and for the day a local-path side table exists.
            if (attachment.uploadStatus === 'uploaded' || !attachment.localUri) continue
            // The blob may already be in storage with the row not updated yet:
            // `setAttachmentUploaded` is queued like every other write, and the
            // local file is deleted as soon as it is queued. Re-uploading from
            // a path that no longer exists would only mark the photo failed.
            if (hasPendingUploadedOp(attachment.id)) continue
            get().enqueue({ applicationId: application.id, itemId, attachment })
          }
        }
      },
    }),
    {
      name: '@vistoria/upload-queue',
      storage: createJSONStorage(() => AsyncStorage),
      // Runtime-only state: an in-flight marker from a dead process is a lie,
      // and `abandoned`/`blocked` only mean anything within one session.
      partialize: (state) => ({ queue: state.queue }) as UploadState,
      onRehydrateStorage: () => () => drainQueue(),
    },
  ),
)

export function startUploadRecovery() {
  if (recoveryStarted) return
  recoveryStarted = true
  void useUploadStore.getState().resumePending().catch(() => undefined)
}

export function subscribeToUploadRecovery() {
  const onStateChange = (state: AppStateStatus) => {
    if (state === 'active') {
      void useUploadStore.getState().resumePending().catch(() => undefined)
    }
  }
  const subscription = AppState.addEventListener('change', onStateChange)
  // An upload that failed only because its attachment row wasn't on the
  // server yet has no other event to wake it before the next foreground. The
  // outbox shrinking is exactly that event.
  const unsubscribeOutbox = useOutbox.subscribe(() => {
    rearmJobsWithRows()
    drainQueue()
  })
  startUploadRecovery()
  return () => {
    subscription.remove()
    unsubscribeOutbox()
  }
}

/**
 * The local file for every photo that still owes an upload, keyed by
 * attachment id — the input `resolvePreviewUri` needs to keep showing a
 * thumbnail for a photo whose `addAttachment` op has already drained.
 *
 * The read model can't carry this: `localUri` only ever exists on the
 * attachment an `addAttachment` op built locally, and the overlay stops
 * re-applying that op the second it lands — from then on the entity is the
 * server's copy, which has no notion of a file on this device. The persisted
 * queue above is the durable record of "the blob for attachment X is still at
 * this path", and an entry is dropped in the same breath as its local file is
 * deleted (`processJob`), so it expires exactly when the server's own URL
 * becomes the right answer.
 */
export function useLocalUploadUris(): Record<string, string> {
  return useUploadStore(
    useShallow((state) => {
      const uris: Record<string, string> = {}
      for (const job of state.queue) {
        if (job.attachment.localUri) uris[job.attachment.id] = job.attachment.localUri
      }
      return uris
    }),
  )
}
