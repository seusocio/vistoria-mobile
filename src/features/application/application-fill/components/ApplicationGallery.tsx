import { memo, useMemo } from 'react'
import { PhotoGalleryRow } from '@/components'
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
  const photos = useMemo(
    () =>
      attachments
        .filter((attachment) => !attachment.deletedAt)
        .map((attachment, index) => ({
          id: attachment.id,
          uri: attachment.url ?? attachment.localUri,
          uploading: attachment.uploadStatus === 'pending',
          failed: attachment.uploadStatus === 'failed',
          progress: uploadProgress[attachment.id] ?? 0,
          onPress: () => onOpenPhoto(index),
          onRemove: () => onRemoveAttachment(attachment.id),
          onRetry: () => onRetryAttachment(attachment.id),
        })),
    [attachments, onOpenPhoto, onRemoveAttachment, onRetryAttachment, uploadProgress],
  )
  return <PhotoGalleryRow photos={photos} />
})
