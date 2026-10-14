import { addAttachment } from '@/features/application/shared/application.ops'
import { createAttachment } from '@/features/application/shared/application.utils'
import { generateId } from '@/lib/id'
import { enqueueOp } from '@/lib/offline-queue'
import { prepareAudioFile } from '@/lib/uploads/prepare-audio'
import { useUploadStore } from '@/lib/uploads/upload-store'
import { transcribeAudio } from '@/lib/voice/voice-service'
import { createNote, deleteNoteOp, patchNote } from './note.ops'
import type { Note } from './note.types'
import { useTranscriptions } from './transcription.store'

/**
 * Every way a Note gets written. Plain functions, not a hook: the camera
 * screen creates its note after it has already been popped, and a voice note
 * finishes transcribing whether or not the visit screen is still mounted.
 */

/** Mirrors the server's validity rule (422 otherwise): non-blank text or at least one attachment. */
export function isPostable(text: string, attachmentIds: string[]): boolean {
  return text.trim().length > 0 || attachmentIds.length > 0
}

/**
 * Enqueue *after* every attachment's `addAttachment` op — see `createNote`'s
 * ordering contract. Returns the note id, or null when there was nothing to post.
 */
export function postNote(applicationId: string, text: string, attachmentIds: string[] = []): string | null {
  const trimmed = text.trim()
  if (!isPostable(trimmed, attachmentIds)) return null
  const now = new Date().toISOString()
  const note: Note = {
    id: generateId('note_'),
    applicationId,
    text: trimmed,
    attachmentIds,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  enqueueOp(createNote, { note })
  return note.id
}

export function editNoteText(note: Note, text: string): boolean {
  const trimmed = text.trim()
  if (!isPostable(trimmed, note.attachmentIds) || trimmed === note.text) return false
  enqueueOp(patchNote, {
    applicationId: note.applicationId,
    noteId: note.id,
    text: trimmed,
    updatedAt: new Date().toISOString(),
  })
  return true
}

export function deleteNote(note: Note) {
  enqueueOp(deleteNoteOp, {
    applicationId: note.applicationId,
    noteId: note.id,
    deletedAt: new Date().toISOString(),
  })
}

/**
 * Stop → durable copy → attachment row + upload queued → note posted right
 * away with the audio only → transcription runs in the background and lands as
 * a `notes.patch` with the text.
 *
 * Nothing here waits on the model: on-device transcription can take many
 * seconds, and holding the composer (or the note) until it finishes is what
 * blocked people from typing after a recording. FIFO keeps the patch behind
 * its create. A failed transcription leaves the audio-only note as it is —
 * the recording is what mustn't be lost; text can be typed in later.
 *
 * Resolves once the note is queued; `onTranscribed` fires later, with `''`
 * when there was nothing to transcribe or it failed.
 */
export async function postVoiceNote(params: {
  applicationId: string
  recordingUri: string
  position: number
  onTranscribed?: (text: string) => void
}): Promise<void> {
  const prepared = await prepareAudioFile(params.recordingUri)
  const now = new Date().toISOString()
  const attachment = createAttachment(
    {
      id: generateId('attachment_'),
      name: `Áudio ${new Date().toLocaleString('pt-BR')}`,
      localUri: prepared.uri,
      uploadStatus: 'pending',
      mimeType: prepared.mimeType,
    },
    params.position,
    now,
  )
  enqueueOp(addAttachment, {
    applicationId: params.applicationId,
    itemId: null,
    attachment,
    updatedAt: now,
  })
  useUploadStore.getState().enqueue({ applicationId: params.applicationId, itemId: null, attachment })

  const noteId = postNote(params.applicationId, '', [attachment.id])
  if (!noteId) return
  void transcribeIntoNote(params.applicationId, noteId, prepared.uri, params.onTranscribed)
}

async function transcribeIntoNote(
  applicationId: string,
  noteId: string,
  audioUri: string,
  onTranscribed?: (text: string) => void,
) {
  useTranscriptions.getState().start(noteId)
  let text = ''
  try {
    text = (await transcribeAudio(audioUri)).trim()
  } catch {
    // Android/web, or the model failed to load — the note stays audio-only.
  } finally {
    useTranscriptions.getState().finish(noteId)
  }
  if (text) {
    enqueueOp(patchNote, { applicationId, noteId, text, updatedAt: new Date().toISOString() })
  }
  onTranscribed?.(text)
}
