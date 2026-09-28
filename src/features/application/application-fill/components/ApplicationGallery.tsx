import { memo, useMemo } from 'react'
import { PhotoGalleryRow } from '@/components'
import { resolvePreviewUri } from '@/features/application/shared/attachment-preview'
import { useAttachmentVisibility } from '@/features/application/shared/attachment-visibility'
import { useLocalUploadUris } from '@/lib/uploads/upload-store'
import type { Attachment } from '@/features/application/shared/application.types'

interface ApplicationGalleryProps {
  attachments: Attachment[]
  uploadProgress: Record<string, number>
  onRemoveAttachment: (attachmentId: string) => void
  onRetryAttachment: (attachmentId: string) => void
  onOpenPhoto: (index: number) => void
}

export const ApplicationGallery = memo(function ApplicationGallery({
  attachments,
  uploadProgress,
  onRemoveAttachment,
  onRetryAttachment,
  onOpenPhoto,
}: ApplicationGalleryProps) {
  const hiddenIds = useAttachmentVisibility((state) => state.hiddenIds)
  const localUris = useLocalUploadUris()
  const photos = useMemo(
    () =>
      attachments
        .filter((attachment) => !attachment.deletedAt && !hiddenIds[attachment.id])
        .map((attachment, index) => ({
          id: attachment.id,
          uri: resolvePreviewUri(attachment, localUris),
          uploading: attachment.uploadStatus === 'pending',
          failed: attachment.uploadStatus === 'failed',
          progress: uploadProgress[attachment.id] ?? 0,
          onPress: () => onOpenPhoto(index),
          onRemove: () => onRemoveAttachment(attachment.id),
          onRetry: () => onRetryAttachment(attachment.id),
        })),
    [attachments, hiddenIds, localUris, onOpenPhoto, onRemoveAttachment, onRetryAttachment, uploadProgress],
  )
  return <PhotoGalleryRow photos={photos} />
})
