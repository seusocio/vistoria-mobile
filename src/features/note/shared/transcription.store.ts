import { create } from 'zustand'

/**
 * Notes whose audio is still being transcribed on this device. Session-only on
 * purpose: a transcription is an in-memory promise, so after a restart there is
 * nothing running and the note just shows as audio without text.
 */
interface TranscriptionState {
  pending: Record<string, true>
  start: (noteId: string) => void
  finish: (noteId: string) => void
}

export const useTranscriptions = create<TranscriptionState>((set) => ({
  pending: {},
  start: (noteId) => set((state) => ({ pending: { ...state.pending, [noteId]: true } })),
  finish: (noteId) =>
    set((state) => {
      const { [noteId]: _done, ...pending } = state.pending
      return { pending }
    }),
}))
