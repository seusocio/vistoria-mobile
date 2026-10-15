import { create } from 'zustand'
import type { Note } from './note.types'

/**
 * A note shown in the feed before its `notes.create` is queued. Photo notes
 * can't enqueue the create until every `addAttachment` is (FIFO contract), and
 * each photo first waits its turn in the serial resize chain — seconds for a
 * camera session. Without a draft the photos show up in the gallery while the
 * Atividade feed shows nothing.
 *
 * Session-only on purpose: the commits it waits on are in-memory promises, so
 * after a restart there is nothing left to post. `postNote` with the same id
 * replaces the draft.
 */
export interface NoteDraft {
  note: Note
  /** Raw picker/camera URI per attachment id, for photos whose `addAttachment` isn't queued yet. */
  photoUris: Record<string, string>
}

interface NoteDraftsState {
  drafts: Record<string, NoteDraft>
  put: (draft: NoteDraft) => void
  discard: (noteId: string) => void
}

export const useNoteDrafts = create<NoteDraftsState>((set) => ({
  drafts: {},
  put: (draft) => set((state) => ({ drafts: { ...state.drafts, [draft.note.id]: draft } })),
  discard: (noteId) =>
    set((state) => {
      if (!state.drafts[noteId]) return state
      const { [noteId]: _removed, ...rest } = state.drafts
      return { drafts: rest }
    }),
}))
