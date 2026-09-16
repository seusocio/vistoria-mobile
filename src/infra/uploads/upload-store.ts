import { AppState, type AppStateStatus } from 'react-native'
import { create } from 'zustand'
import type { Application, Attachment } from '@/infra/domain/entities'
import { generateId } from '@/infra/id'
import { api } from '../../../convex/_generated/api'
import { convexClient } from '../convex/client'
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
  queue: UploadJob[]
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

async function setStatus(
  job: UploadJob,
  uploadStatus: 'pending' | 'failed',
) {
  await convexClient.mutation(api.applications.setAttachmentUploadStatus, {
    applicationId: job.applicationId,
    attachmentId: job.attachment.id,
    uploadStatus,
    updatedAt: new Date().toISOString(),
  })
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
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        storageId = await uploadImage(
          job.attachment.localUri ?? '',
          job.attachment.mimeType,
          (fraction) =>
            useUploadStore.setState((state) => ({
              progress: { ...state.progress, [attachmentId]: fraction },
            })),
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
      return
    }

    await convexClient.mutation(api.applications.setAttachmentUploaded, {
      applicationId: job.applicationId,
      attachmentId,
      storageId,
      updatedAt: new Date().toISOString(),
    })
  } catch {
    try {
      await setStatus(job, 'failed')
    } catch {
      // The pending row remains durable and will be retried on the next launch.
    }
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
      (job) => !state.inFlight[job.attachment.id],
    )
    if (!next) return
    useUploadStore.setState((current) => ({
      queue: current.queue.filter(
        (job) => job.attachment.id !== next.attachment.id,
      ),
    }))
    activeWorkers += 1
    void processJob(next).finally(() => {
      activeWorkers -= 1
      drainQueue()
    })
  }
}

export const useUploadStore = create<UploadState>((set, get) => ({
  progress: {},
  inFlight: {},
  abandoned: {},
  queue: [],
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
    const applications = (await convexClient.query(api.applications.listAll, {})) as Application[]
    for (const application of applications) {
      for (const attachment of application.attachments) {
        if (attachment.uploadStatus === 'pending' && attachment.localUri) {
          get().enqueue({
            applicationId: application.id,
            itemId: null,
            attachment,
          })
        }
      }
      for (const item of application.items) {
        for (const attachment of item.attachments) {
          if (attachment.uploadStatus === 'pending' && attachment.localUri) {
            get().enqueue({
              applicationId: application.id,
              itemId: item.id,
              attachment,
            })
          }
        }
      }
    }
  },
}))

export function enqueueUpload(
  applicationId: string,
  itemId: string | null,
  input: Omit<Attachment, 'id' | 'position' | 'createdAt' | 'deletedAt'> & {
    name: string
  },
  position: number,
): Attachment {
  const attachment: Attachment = {
    ...input,
    id: generateId('attachment_'),
    position,
    createdAt: new Date().toISOString(),
    deletedAt: null,
    uploadStatus: 'pending',
  }
  useUploadStore.getState().enqueue({ applicationId, itemId, attachment })
  return attachment
}

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
