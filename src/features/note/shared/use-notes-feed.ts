import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useIsOnline, useOutbox } from '@/lib/offline-queue'
import { mergePendingIntoList } from '@/lib/offline-queue/overlay'
import { useNotesRestResult } from './note.rest'
import type { Note } from './note.types'

const getId = (note: Note) => note.id

export interface NotesFeed {
  /** Newest first, pending writes applied, deleted rows hidden. `undefined` only while the first page is still loading. */
  notes: Note[] | undefined
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
}

/**
 * The Activity feed's read. Not `useEntityList`: that one is built around a
 * Convex query reference, and notes never existed in Convex. The merge is the
 * same pure `mergePendingIntoList` it uses, over the paged REST read.
 */
export function useNotesFeed(applicationId: string): NotesFeed {
  const rest = useNotesRestResult(applicationId)
  const pending = useOutbox(useShallow((state) => state.items.filter((item) => item.kind === 'note')))
  const isOnline = useIsOnline()
  const serverNotes = rest?.data
  // Offline with nothing cached, the paged fetch is *paused*, not failed —
  // without this the feed would spin until the network came back.
  const settledEmpty = serverNotes === undefined && !isOnline

  const notes = useMemo(() => {
    // Offset paging shifts when notes are created between page fetches, so the
    // same row can come back on two pages — keep the first (newest) copy.
    const seen = new Set<string>()
    const server: Note[] = []
    for (const note of serverNotes ?? []) {
      if (seen.has(note.id)) continue
      seen.add(note.id)
      server.push(note)
    }
    if (serverNotes === undefined && pending.length === 0 && !settledEmpty) return undefined
    return mergePendingIntoList(server, pending, {
      kind: 'note',
      getId,
      belongs: (note) => note.applicationId === applicationId,
    })
      .filter((note) => note.applicationId === applicationId && !note.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  }, [serverNotes, pending, applicationId, settledEmpty])

  return {
    notes,
    hasNextPage: rest?.hasNextPage ?? false,
    isFetchingNextPage: rest?.isFetchingNextPage ?? false,
    fetchNextPage: rest?.fetchNextPage ?? (() => undefined),
  }
}
