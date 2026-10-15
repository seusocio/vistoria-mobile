import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useIsOnline, useOutbox } from '@/lib/offline-queue'
import { mergePendingIntoList } from '@/lib/offline-queue/overlay'
import { useNoteDrafts } from './note-drafts.store'
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
  const drafts = useNoteDrafts((state) => state.drafts)
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
    const drafted = Object.values(drafts)
      .map((draft) => draft.note)
      .filter((note) => note.applicationId === applicationId && !seen.has(note.id))
    if (serverNotes === undefined && pending.length === 0 && drafted.length === 0 && !settledEmpty) return undefined
    const merged = mergePendingIntoList(server, pending, {
      kind: 'note',
      getId,
      belongs: (note) => note.applicationId === applicationId,
    })
    // Not yet in the outbox (see `useNoteDrafts`); once posted, the queued copy wins.
    const queued = new Set(merged.map(getId))
    return [...merged, ...drafted.filter((note) => !queued.has(note.id))]
      .filter((note) => note.applicationId === applicationId && !note.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  }, [serverNotes, pending, drafts, applicationId, settledEmpty])

  return {
    notes,
    hasNextPage: rest?.hasNextPage ?? false,
    isFetchingNextPage: rest?.isFetchingNextPage ?? false,
    fetchNextPage: rest?.fetchNextPage ?? (() => undefined),
  }
}
