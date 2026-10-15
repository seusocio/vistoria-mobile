import { useState } from 'react'
import type { Application } from '@/features/application/shared/application.types'
import { isVisibleImage } from '@/features/application/shared/application.utils'
import { useLocalUploadUris, useUploadStore } from '@/lib/uploads/upload-store'
import { useAttachPhotos } from '../shared/use-attach-photos'
import { resolvePreviewUri } from '../shared/attachment-preview'
import { useAttachmentVisibility } from '../shared/attachment-visibility'

/** Removing and retrying the visit's and its items' photos, and the full-screen viewer over them. */
export function useApplicationPhotos(application: Application) {
  const { removeAttachment: removeAttachmentPipeline } = useAttachPhotos()
  const uploadProgress = useUploadStore((state) => state.progress)
  const hiddenAttachmentIds = useAttachmentVisibility((state) => state.hiddenIds)
  const localUploadUris = useLocalUploadUris()

  const [viewer, setViewer] = useState<{ itemId: string | null; index: number } | null>(null)

  function removeApplicationAttachment(attachmentId: string) {
    const attachment = application.attachments.find((candidate) => candidate.id === attachmentId)
    if (!attachment) return
    removeAttachmentPipeline({ applicationId: application.id, itemId: null, attachment })
  }

  function removeItemAttachment(itemId: string, attachmentId: string) {
    const item = application.items.find((candidate) => candidate.id === itemId)
    const attachment = item?.attachments.find((candidate) => candidate.id === attachmentId)
    if (!attachment) return
    removeAttachmentPipeline({ applicationId: application.id, itemId, attachment })
  }

  function retryApplicationAttachment(attachmentId: string) {
    const attachment = application.attachments.find((candidate) => candidate.id === attachmentId)
    if (!attachment) return
    useUploadStore.getState().enqueue({ applicationId: application.id, itemId: null, attachment })
  }

  function retryItemAttachment(itemId: string, attachmentId: string) {
    const item = application.items.find((candidate) => candidate.id === itemId)
    const attachment = item?.attachments.find((candidate) => candidate.id === attachmentId)
    if (!attachment) return
    useUploadStore.getState().enqueue({ applicationId: application.id, itemId, attachment })
  }

  const viewerAttachments = viewer
    ? (viewer.itemId === null
        ? application.attachments
        : (application.items.find((item) => item.id === viewer.itemId)?.attachments ?? [])
      ).filter((attachment) => isVisibleImage(attachment, hiddenAttachmentIds))
    : []
  const viewerPhotos = viewerAttachments.map((attachment) => ({
    id: attachment.id,
    uri: resolvePreviewUri(attachment, localUploadUris),
    uploading: attachment.uploadStatus === 'pending',
    progress: uploadProgress[attachment.id] ?? 0,
  }))

  return {
    uploadProgress,
    viewer,
    viewerPhotos,
    onRemoveApplicationAttachment: removeApplicationAttachment,
    onRetryApplicationAttachment: retryApplicationAttachment,
    onRemoveItemAttachment: removeItemAttachment,
    onRetryItemAttachment: retryItemAttachment,
    onOpenPhoto: (itemId: string | null, index: number) => setViewer({ itemId, index }),
    onCloseViewer: () => setViewer(null),
    onDeletePhotoFromViewer: (attachmentId: string) => {
      if (!viewer) return
      if (viewer.itemId === null) removeApplicationAttachment(attachmentId)
      else removeItemAttachment(viewer.itemId, attachmentId)
    },
  }
}
