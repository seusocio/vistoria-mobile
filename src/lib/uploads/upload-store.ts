import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, type AppStateStatus } from 'react-native'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import type { Attachment } from '@/features/application/shared/application.types'
import { useOutbox } from '@/lib/offline-queue'
import { onScopeGone } from '@/lib/offline-queue/drain-log'
import { deleteLocalUpload, rebaseLocalUri } from '../photos/photo-picker'
import { getUploadJobDebug, processJob } from './upload-job'
import { isAwaitingAttachmentRow } from './upload-outbox'

export interface UploadJob {
  applicationId: string
  itemId: string | null
  attachment: Attachment
}
export interface UploadState {
  progress: Record<string, number>
  inFlight: Record<string, true>
  abandoned: Record<string, true>
  /** Jobs that have not finished yet. Persisted — this is the durable part. */
  queue: UploadJob[]
  /** Failed this session; skipped until the next recovery pass re-arms them. */
  blocked: Record<string, true>
  /** Why each attachment's last upload attempt failed, this session — read by the outbox debugger. */
  errors: Record<string, string>
  enqueue: (job: UploadJob) => void
  cancel: (attachmentId: string) => void
  resumePending: () => void
}

const MAX_CONCURRENCY = 3
let activeWorkers = 0
let recoveryStarted = false

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
    void processJob(useUploadStore, next).finally(() => {
      activeWorkers -= 1
      drainQueue()
    })
  }
}

/** Session-only worker state that lives outside the store, for the outbox debugger. */
export function getUploadWorkerDebug() {
  const { healedRows, markedFailed } = getUploadJobDebug()
  return {
    activeWorkers,
    recoveryStarted,
    healedRows,
    markedFailed,
  }
}

/**
 * Photo uploads, durable across a process kill.
 *
 * The queue is persisted because it is the only index of pending work: a
 * photo taken offline has no server row yet (its `addAttachment` is still in
 * the outbox), and a server read never carries a local file path. The blob
 * itself is already durable — `prepareAsset` writes it to
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
      errors: {},
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
      resumePending: () => {
        // Re-arm anything that failed earlier in this session: the usual
        // reason an upload failed is the network. The persisted queue is the
        // whole story — a server read never carries the `localUri` a
        // re-upload needs.
        set({ blocked: {} })
        drainQueue()
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

// The drain dropped every write for a Visita the server no longer has. Its
// uploads go too: each would only 404 at presign and re-create its row.
onScopeGone((applicationId) => {
  const { queue, cancel } = useUploadStore.getState()
  for (const job of queue) {
    if (job.applicationId !== applicationId) continue
    cancel(job.attachment.id)
    void deleteLocalUpload(job.attachment.localUri)
  }
})

export function startUploadRecovery() {
  if (recoveryStarted) return
  recoveryStarted = true
  useUploadStore.getState().resumePending()
}

export function subscribeToUploadRecovery() {
  const onStateChange = (state: AppStateStatus) => {
    if (state === 'active') {
      useUploadStore.getState().resumePending()
    }
  }
  const subscription = AppState.addEventListener('change', onStateChange)
  // An upload that failed only because its attachment row wasn't on the
  // server yet has no other event to wake it before the next foreground. The
  // outbox shrinking is exactly that event.
  // Only when it *shrinks*: re-arming on growth let a failing upload's own
  // "mark failed" op wake it up again, an endless enqueue/fail/enqueue loop.
  const unsubscribeOutbox = useOutbox.subscribe((state, previous) => {
    if (state.items.length >= previous.items.length) return
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
        if (job.attachment.localUri) uris[job.attachment.id] = rebaseLocalUri(job.attachment.localUri)
      }
      return uris
    }),
  )
}
