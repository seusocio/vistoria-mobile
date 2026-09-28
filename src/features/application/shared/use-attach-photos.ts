import { useUndoToast } from '@/components'
import { enqueueOp } from '@/lib/offline-queue'
import { deleteLocalUpload, prepareAssetQueued, type RawAsset } from '@/lib/convex/photo-picker'
import type { Attachment } from '@/features/application/shared/application.types'
import { generateId } from '@/lib/id'
import { createAttachment } from '@/features/application/shared/application.utils'
import { useUploadStore } from '@/lib/uploads/upload-store'
import { useAttachmentVisibility } from './attachment-visibility'
import { addAttachment, deleteAttachment } from './application.ops'

interface CommitAssetParams extends RawAsset {
  attachmentId: string
  applicationId: string
  itemId: string | null
  position: number
  isCancelled?: () => boolean
}

interface RemoveAttachmentParams {
  applicationId: string
  itemId: string | null
  attachment: Attachment
}

/**
 * Shared pipeline for attaching and removing photos, used by both the
 * continuous-capture camera and the application/item galleries — keeps the
 * outbox-enqueue + background-upload + purge-on-commit invariants in one
 * place instead of duplicated per screen.
 *
 * Every write here goes through enqueueOp, which never rejects to the
 * caller — it persists locally and drains when it can. There is no error
 * path to report back for these anymore; a queued write always "succeeds"
 * from the UI's perspective.
 */
export function useAttachPhotos() {
  const { show: showUndo } = useUndoToast()

  function beginAttachment(): string {
    return generateId('attachment_')
  }

  async function commitAsset(params: CommitAssetParams) {
    const prepared = await prepareAssetQueued({
      uri: params.uri,
      width: params.width,
      height: params.height,
    })
    if (params.isCancelled?.()) {
      await deleteLocalUpload(prepared.uri)
      return
    }

    const updatedAt = new Date().toISOString()
    const attachment = createAttachment(
      {
        id: params.attachmentId,
        name: `Foto ${Date.now()}`,
        localUri: prepared.uri,
        uploadStatus: 'pending',
        mimeType: prepared.mimeType,
        width: prepared.width,
        height: prepared.height,
      },
      params.position,
      updatedAt,
    )

    enqueueOp(addAttachment, {
      applicationId: params.applicationId,
      itemId: params.itemId,
      attachment,
      updatedAt,
    })

    useUploadStore.getState().enqueue({
      applicationId: params.applicationId,
      itemId: params.itemId,
      attachment,
    })
  }

  /**
   * The undo-toast window is local-only state (`attachment-visibility.ts`)
   * now, not a queued op: nothing is enqueued until "Desfazer" can no longer
   * apply, so undoing is just un-hiding rather than reversing a write the
   * server may already have seen.
   */
  function removeAttachment(params: RemoveAttachmentParams) {
    const { applicationId, itemId, attachment } = params
    useAttachmentVisibility.getState().hide(attachment.id)

    showUndo({
      message: 'Foto removida',
      onUndo: () => useAttachmentVisibility.getState().show(attachment.id),
      onCommit: () => {
        useUploadStore.getState().cancel(attachment.id)
        void deleteLocalUpload(attachment.localUri)
        enqueueOp(deleteAttachment, { applicationId, itemId, attachmentId: attachment.id })
        useAttachmentVisibility.getState().show(attachment.id)
      },
    })
  }

  return { beginAttachment, commitAsset, removeAttachment }
}
