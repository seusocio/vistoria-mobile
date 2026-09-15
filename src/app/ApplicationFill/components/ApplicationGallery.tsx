import { memo, useMemo } from 'react'
import { PhotoGalleryRow } from '@/components'
import type { Attachment } from '@/infra/domain/entities'

interface ApplicationGalleryProps {
  attachments: Attachment[]
  uploadProgress: Record<string, number>
  onRemoveAttachment: (attachmentId: string) => void
}

export const ApplicationGallery = memo(function ApplicationGallery({
  attachments,
  uploadProgress,
  onRemoveAttachment,
}: ApplicationGalleryProps) {
  const photos = useMemo(
    () =>
      attachments
        .filter((attachment) => !attachment.deletedAt)
        .map((attachment) => ({
          id: attachment.id,
          uri: attachment.url ?? attachment.localUri,
          uploading: attachment.uploadStatus === 'pending',
          progress: uploadProgress[attachment.id] ?? 0,
          onRemove: () => onRemoveAttachment(attachment.id),
        })),
    [attachments, onRemoveAttachment, uploadProgress],
  )
  return <PhotoGalleryRow photos={photos} />
})
