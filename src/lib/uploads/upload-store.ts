import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, type AppStateStatus } from 'react-native'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  setAttachmentUploaded,
  setAttachmentUploadStatus,
} from '@/features/application/shared/application.ops'
import type { Application, Attachment } from '@/features/application/shared/application.types'
import { enqueueOp, useOutbox } from '@/lib/offline-queue'
import { api } from '../../../convex/_generated/api'
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
    let storageId: string | null = null
    let lastError: unknown
    let lastReportedBucket = 0
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        storageId = await uploadImage(
          job.attachment.localUri ?? '',
          job.attachment.mimeType,
          (fraction) => {
            const bucket = Math.round(fraction * 20)
            if (bucket === lastReportedBucket) return
            lastReportedBucket = bucket
            useUploadStore.setState((state) => ({
              progress: { ...state.progress, [attachmentId]: fraction },
            }))
          },
          job.uploadUrl,
        )
        break
      } catch (error) {
        lastError = error
        if (attempt < MAX_ATTEMPTS - 1) await wait(2 ** attempt * 1000)
      }
    }
    if (!storageId) throw lastError ?? new Error('Não foi possível enviar a foto')

    if (useUploadStore.getState().abandoned[attachmentId]) {
      try {
        await convexClient.mutation(api.files.remove, { storageId })
      } catch {
        // já removido
      }
      useUploadStore.setState((state) => {
        const { [attachmentId]: _abandoned, ...abandoned } = state.abandoned
        return { abandoned }
      })
      dropFromQueue(attachmentId)
      return
    }

    // Through the outbox: the blob is already in Convex storage at this
    // point, and losing this write would leave the app re-uploading a photo
    // the server already has, forever.
    enqueueOp(setAttachmentUploaded, {
      applicationId: job.applicationId,
      attachmentId,
      storageId,
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
          applications = (await convexClient.query(api.applications.listAll, {})) as Application[]
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
            if (attachment.uploadStatus === 'uploaded' || !attachment.localUri) continue
            if (attachment.storageId) continue
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
  startUploadRecovery()
  return () => subscription.remove()
}
