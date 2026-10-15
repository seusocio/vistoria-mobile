import { useCallback, useMemo } from 'react'
import { isVisibleImage } from '@/features/application/shared/application.utils'
import { useNoteDrafts } from '@/features/note/shared/note-drafts.store'
import type { Note } from '@/features/note/shared/note.types'
import { useLocalUploadUris } from '@/lib/uploads/upload-store'
import type { ApplicationFillContainer } from '../application-fill/application-fill.container'
import { resolvePreviewUri } from '../shared/attachment-preview'
import { useAttachmentVisibility } from '../shared/attachment-visibility'
import type { Attachment } from '../shared/application.types'
import type { NoteAttachmentView } from './components/NoteCard'
import type { GalleryPhoto } from './components/VisitaGallery'
import { confirmRemovePhoto } from './visita-prompts'

/** The visit's photos as the Fotos grid and the Atividade feed show them. */
export function useVisitaAttachments(c: ApplicationFillContainer) {
  const localUris = useLocalUploadUris()
  const hiddenIds = useAttachmentVisibility((state) => state.hiddenIds)
  const app = c.application

  // Same list (and indices) the PhotoViewer opens on — `isVisibleImage` is shared with the container.
  const visiblePhotos = useMemo(
    () => app.attachments.filter((a) => isVisibleImage(a, hiddenIds)),
    [app.attachments, hiddenIds],
  )
  // Note attachments resolve against the application's own list. The ops write
  // their server answer into that cache synchronously (`patchCachedAttachments`),
  // so there's no gap here to paper over.
  const attachmentsById = useMemo(() => {
    const map = new Map<string, Attachment>()
    for (const a of app.attachments) if (!a.deletedAt && !hiddenIds[a.id]) map.set(a.id, a)
    for (const item of app.items) for (const a of item.attachments) if (!a.deletedAt) map.set(a.id, a)
    return map
  }, [app.attachments, app.items, hiddenIds])

  const galleryPhotos = useMemo<GalleryPhoto[]>(
    () =>
      visiblePhotos.map((a, index) => ({
        id: a.id,
        uri: resolvePreviewUri(a, localUris),
        uploading: a.uploadStatus === 'pending',
        failed: a.uploadStatus === 'failed',
        progress: c.uploadProgress[a.id] ?? 0,
        onPress: () => c.onOpenPhoto(null, index),
        onRemove: () => confirmRemovePhoto(() => c.onRemoveApplicationAttachment(a.id)),
        onRetry: () => c.onRetryApplicationAttachment(a.id),
      })),
    [
      visiblePhotos,
      localUris,
      c.uploadProgress,
      c.onOpenPhoto,
      c.onRemoveApplicationAttachment,
      c.onRetryApplicationAttachment,
    ],
  )
  const removePhoto = useCallback(
    (attachmentId: string) => confirmRemovePhoto(() => c.onRemoveApplicationAttachment(attachmentId)),
    [c.onRemoveApplicationAttachment],
  )

  const noteDrafts = useNoteDrafts((state) => state.drafts)
  /** A draft note's photos that aren't in the application yet — still being prepared, `addAttachment` not queued. */
  const draftPhotos = useMemo(() => {
    const map = new Map<string, Attachment>()
    for (const { note, photoUris } of Object.values(noteDrafts)) {
      for (const [id, uri] of Object.entries(photoUris)) {
        map.set(id, {
          id,
          name: '',
          position: 0,
          createdAt: note.createdAt,
          deletedAt: null,
          localUri: uri,
          uploadStatus: 'pending',
        })
      }
    }
    return map
  }, [noteDrafts])

  const resolveNoteAttachments = useCallback(
    (note: Note): NoteAttachmentView[] =>
      note.attachmentIds.flatMap((id) => {
        const attachment = attachmentsById.get(id) ?? draftPhotos.get(id)
        if (!attachment) return []
        const index = visiblePhotos.indexOf(attachment)
        return [
          {
            attachment,
            uri: resolvePreviewUri(attachment, localUris),
            progress: c.uploadProgress[id] ?? 0,
            viewerIndex: index === -1 ? null : index,
          },
        ]
      }),
    [attachmentsById, draftPhotos, visiblePhotos, localUris, c.uploadProgress],
  )

  return { visiblePhotos, galleryPhotos, removePhoto, resolveNoteAttachments }
}
