import { useUndoToast } from '@/components'
import { deleteLocalUpload, prepareAsset, type RawAsset } from '@/infra/convex/photo-picker'
import type { Attachment } from '@/infra/domain/entities'
import { generateId } from '@/infra/id'
import { createAttachment } from '@/infra/services'
import { useUploadStore } from '@/infra/uploads/upload-store'
import { useApplicationMutations } from './useApplicationMutations'

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
  onError?: () => void
}

/**
 * Shared pipeline for attaching and removing photos, used by both the
 * continuous-capture camera and the application/item galleries — keeps the
 * optimistic-update + background-upload + purge-on-commit invariants in one
 * place instead of duplicated per screen.
 */
export function useAttachPhotos() {
  const mutations = useApplicationMutations()
  const { show: showUndo } = useUndoToast()

  function beginAttachment(): string {
    return generateId('attachment_')
  }

  async function commitAsset(params: CommitAssetParams) {
    const prepared = await prepareAsset({
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

    void mutations
      .addAttachment({
        applicationId: params.applicationId,
        itemId: params.itemId,
        attachment,
        updatedAt,
      })
      .catch(() => undefined)

    useUploadStore.getState().enqueue({
      applicationId: params.applicationId,
      itemId: params.itemId,
      attachment,
    })
  }

  function removeAttachment(params: RemoveAttachmentParams) {
    const { applicationId, itemId, attachment, onError } = params
    const deletedAt = new Date().toISOString()
    void mutations
      .setAttachmentDeletedAt({
        applicationId,
        itemId,
        attachmentId: attachment.id,
        deletedAt,
        updatedAt: deletedAt,
      })
      .catch(() => onError?.())

    showUndo({
      message: 'Foto removida',
      onUndo: () => {
        const updatedAt = new Date().toISOString()
        void mutations
          .setAttachmentDeletedAt({
            applicationId,
            itemId,
            attachmentId: attachment.id,
            deletedAt: null,
            updatedAt,
          })
          .catch(() => onError?.())
      },
      onCommit: () => {
        useUploadStore.getState().cancel(attachment.id)
        void deleteLocalUpload(attachment.localUri)
        void mutations
          .purgeAttachment({ applicationId, itemId, attachmentId: attachment.id })
          .catch(() => undefined)
      },
    })
  }

  return { beginAttachment, commitAsset, removeAttachment }
}
