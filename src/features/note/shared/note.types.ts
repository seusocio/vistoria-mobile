/**
 * A post on a Visita (`Application`): free text plus an ordered list of
 * attachment ids (photos, audio, any file). There is no type/source field — a
 * voice note is just a Note whose `attachmentIds` holds the audio and whose
 * `text` is the accepted transcription. See `vistoria-api`'s CONTEXT.md and
 * ADR 0001 (notes reference attachments by id array).
 */
export interface Note {
  id: string
  applicationId: string
  text: string
  attachmentIds: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  /** Local-only: set by a pending `notes.delete` so the overlay can hide the row before the server confirms. */
  deletedAt?: string | null
}
