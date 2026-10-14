import { create } from 'zustand'

/**
 * On-device transcription state, per note. Session-only on purpose: a
 * transcription is an in-memory promise, and a regenerated candidate is
 * something the person still has to accept — the backend stores nothing about
 * candidates. After a restart there is nothing running and nothing to choose.
 */
interface TranscriptionState {
  /** First transcription of a just-posted voice note (fills an empty note). */
  pending: Record<string, true>
  /** "Gerar transcrição de novo" in flight. */
  regenerating: Record<string, true>
  /** A regenerated text waiting for "Usar nova" / "Manter atual". */
  candidates: Record<string, string>
  start: (noteId: string) => void
  finish: (noteId: string) => void
  startRegenerating: (noteId: string) => void
  finishRegenerating: (noteId: string, candidate: string | null) => void
  clearCandidate: (noteId: string) => void
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record
  return rest
}

export const useTranscriptions = create<TranscriptionState>((set) => ({
  pending: {},
  regenerating: {},
  candidates: {},
  start: (noteId) => set((state) => ({ pending: { ...state.pending, [noteId]: true } })),
  finish: (noteId) => set((state) => ({ pending: without(state.pending, noteId) })),
  startRegenerating: (noteId) =>
    set((state) => ({
      regenerating: { ...state.regenerating, [noteId]: true },
      candidates: without(state.candidates, noteId),
    })),
  finishRegenerating: (noteId, candidate) =>
    set((state) => ({
      regenerating: without(state.regenerating, noteId),
      candidates: candidate ? { ...state.candidates, [noteId]: candidate } : state.candidates,
    })),
  clearCandidate: (noteId) => set((state) => ({ candidates: without(state.candidates, noteId) })),
}))
