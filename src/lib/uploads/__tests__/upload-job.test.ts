import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { createStore } from 'zustand/vanilla'
import { ApiError } from '@/lib/api/fetcher'
import type { Attachment } from '@/features/application/shared/application.types'
import type { UploadJob, UploadState } from '../upload-store'

/*
 * The photo-upload worker's decisions (ADRs 0001/0002): what it queues after
 * an upload succeeds, fails, 404s at presign, or races a delete. Transport and
 * native modules are faked; the job runner, the op definitions and the outbox
 * checks are real.
 */

type Enqueued = { type: string; args: Record<string, unknown> }
let enqueued: Enqueued[] = []
let outboxItems: { type: string; args: unknown }[] = []
let deletedFiles: string[] = []
let upload: (onProgress: (fraction: number) => void) => Promise<void> = async () => {}
let presign: () => Promise<{ key: string }> = async () => ({ key: 'storage/key' })

class MissingLocalFileError extends Error {}

// The real op definitions load; only what they reach that `bun test` can't is faked.
mock.module('@/lib/api/use-infinite-list', () => ({ useInfiniteList: () => undefined }))
mock.module('@/lib/offline-queue', () => ({
  enqueueOp: (definition: { type: string }, args: Record<string, unknown>) => {
    enqueued.push({ type: definition.type, args })
  },
  useOutbox: { getState: () => ({ items: outboxItems }) },
}))
mock.module('@/lib/session/require-active-project', () => ({
  requireActiveProject: () => ({ orgId: 'org', projectId: 'project' }),
}))
mock.module('@/lib/api/uploads', () => ({
  presignAttachmentUpload: () => presign(),
  uploadAttachmentFile: (_uri: string, _mime: string | undefined, _presigned: unknown, onProgress: (f: number) => void) =>
    upload(onProgress),
}))
mock.module('@/lib/photos/photo-picker', () => ({
  MissingLocalFileError,
  rebaseLocalUri: (uri: string | undefined) => uri,
  deleteLocalUpload: async (uri: string | undefined) => {
    if (uri) deletedFiles.push(uri)
  },
}))

const { processJob } = await import('../upload-job')

let counter = 0
function job(): UploadJob {
  counter += 1
  const attachment: Attachment = {
    id: `attachment_${counter}`,
    name: 'foto.jpg',
    position: 0,
    createdAt: '2026-10-15T00:00:00.000Z',
    deletedAt: null,
    localUri: `file:///uploads/foto_${counter}.jpg`,
    uploadStatus: 'pending',
    mimeType: 'image/jpeg',
  }
  return { applicationId: 'application_1', itemId: null, attachment }
}

function storeWith(queued: UploadJob) {
  return createStore<UploadState>()(() => ({
    progress: {},
    inFlight: {},
    abandoned: {},
    queue: [queued],
    blocked: {},
    errors: {},
    enqueue: () => {},
    cancel: () => {},
    resumePending: () => {},
  }))
}

beforeEach(() => {
  enqueued = []
  outboxItems = []
  deletedFiles = []
  upload = async () => {}
  presign = async () => ({ key: 'storage/key' })
})

describe('a photo upload', () => {
  test('that succeeds queues "uploaded", leaves the queue and deletes its local copy', async () => {
    const queued = job()
    const store = storeWith(queued)
    upload = async (onProgress) => onProgress(0.5)

    await processJob(store, queued)

    expect(enqueued).toEqual([
      {
        type: 'applications.setAttachmentUploaded',
        args: expect.objectContaining({ applicationId: 'application_1', attachmentId: queued.attachment.id, storageKey: 'storage/key' }),
      },
    ])
    expect(store.getState().queue).toEqual([])
    expect(deletedFiles).toEqual([queued.attachment.localUri as string])
    expect(store.getState().inFlight).toEqual({})
    expect(store.getState().progress).toEqual({})
  })

  test('whose server row is missing re-creates it once and stays queued until it lands', async () => {
    const queued = job()
    const store = storeWith(queued)
    presign = async () => {
      throw new ApiError(404, 'Not Found', { error: 'anexo não encontrado' })
    }

    await processJob(store, queued)

    expect(enqueued.map((e) => e.type)).toEqual([
      'applications.addAttachment',
      'applications.setAttachmentUploadStatus',
    ])
    expect(enqueued[0].args).toMatchObject({ applicationId: 'application_1', itemId: null, attachment: queued.attachment })
    expect(enqueued[1].args).toMatchObject({ attachmentId: queued.attachment.id, uploadStatus: 'failed' })
    expect(store.getState().queue).toEqual([queued])
    expect(store.getState().blocked[queued.attachment.id]).toBe(true)
  })

  test('whose local file is gone is reported failed once and dropped for good', async () => {
    const queued = job()
    const store = storeWith(queued)
    upload = async () => {
      throw new MissingLocalFileError('gone')
    }

    await processJob(store, queued)

    expect(enqueued.map((e) => e.type)).toEqual(['applications.setAttachmentUploadStatus'])
    expect(store.getState().queue).toEqual([])
    expect(store.getState().errors[queued.attachment.id]).toBe('attempt 1: gone')
  })

  test('is not reported failed again while an earlier "failed" op is still in the outbox', async () => {
    const queued = job()
    const store = storeWith(queued)
    outboxItems = [{ type: 'applications.setAttachmentUploadStatus', args: { attachmentId: queued.attachment.id } }]
    upload = async () => {
      throw new MissingLocalFileError('gone')
    }

    await processJob(store, queued)

    expect(enqueued).toEqual([])
  })
})

describe('a photo deleted while it uploads', () => {
  test('finishes silently: no "uploaded" op, and it leaves the queue', async () => {
    const queued = job()
    const store = storeWith(queued)
    upload = async () => {
      store.setState({ abandoned: { [queued.attachment.id]: true } })
    }

    await processJob(store, queued)

    expect(enqueued).toEqual([])
    expect(store.getState().queue).toEqual([])
    expect(store.getState().abandoned).toEqual({})
  })

  test('never re-creates its row when presign 404s — the 404 is the delete landing', async () => {
    const queued = job()
    const store = storeWith(queued)
    store.setState({ abandoned: { [queued.attachment.id]: true } })
    presign = async () => {
      throw new ApiError(404, 'Not Found', { error: 'anexo não encontrado' })
    }

    await processJob(store, queued)

    expect(enqueued).toEqual([])
    expect(store.getState().queue).toEqual([])
  })
})
