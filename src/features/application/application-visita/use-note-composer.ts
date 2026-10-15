import { useCallback, useState } from 'react'
import { Alert } from 'react-native'
import { draftNote, editNoteText, postNote } from '@/features/note/shared/note.actions'
import type { Note } from '@/features/note/shared/note.types'
import { PICK_PHOTOS_ERROR_MESSAGE, pickPhotos, type PickedPhoto } from '@/lib/photos/photo-picker'
import type { ApplicationFillContainer } from '../application-fill/application-fill.container'
import { useAttachPhotos } from '../shared/use-attach-photos'

export type VisitaTab = 'atividade' | 'fotos' | 'pendencias'

/**
 * The bottom composer's text and what sending it does: on Atividade/Fotos it
 * posts (or edits) a note, on Pendências it opens "adicionar item" with the
 * text as its title.
 */
export function useNoteComposer(c: ApplicationFillContainer, tab: VisitaTab) {
  const { beginAttachment, commitAsset } = useAttachPhotos()
  const [draft, setDraft] = useState('')
  /** Set while the composer edits an existing note's text instead of posting a new one (WhatsApp-style edit). */
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const app = c.application

  const startEdit = useCallback((note: Note) => {
    setEditingNote(note)
    setDraft(note.text)
  }, [])

  const cancelEdit = () => {
    setEditingNote(null)
    setDraft('')
  }

  const submit = () => {
    const text = draft.trim()
    if (tab === 'pendencias') {
      if (!text) return
      c.onOpenAddItem()
      c.newItemForm.setValue('title', text, { shouldDirty: true })
      setDraft('')
      return
    }
    if (editingNote) {
      if (!text && editingNote.attachmentIds.length === 0) {
        Alert.alert('Nota vazia', 'Para apagar a nota, use "Excluir nota".')
        return
      }
      editNoteText(editingNote, text)
      cancelEdit()
      return
    }
    if (postNote(app.id, text)) setDraft('')
  }

  /** Photos from the library become one note, with whatever is typed in the composer as its caption. */
  const pickFromLibrary = async () => {
    let picked: PickedPhoto[]
    try {
      picked = await pickPhotos('library')
    } catch {
      Alert.alert('Não foi possível carregar as fotos', PICK_PHOTOS_ERROR_MESSAGE)
      return
    }
    if (picked.length === 0) return
    const caption = draft
    setDraft('')
    const photos = picked.map((asset) => ({ asset, id: beginAttachment() }))
    const noteId = draftNote(
      app.id,
      caption,
      photos.map(({ asset, id }) => ({ id, uri: asset.uri })),
    )
    const commits = photos.map(({ asset, id: attachmentId }, i) =>
      commitAsset({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        attachmentId,
        applicationId: app.id,
        itemId: null,
        position: app.attachments.length + i,
      }).then(() => attachmentId),
    )
    // Every `addAttachment` must be queued before the note that references it.
    const settled = await Promise.allSettled(commits)
    const ids = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    postNote(app.id, caption, ids, noteId)
  }

  return { draft, setDraft, editingNote, startEdit, cancelEdit, submit, pickFromLibrary }
}

export type NoteComposerState = ReturnType<typeof useNoteComposer>
