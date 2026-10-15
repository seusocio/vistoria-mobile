import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import {
  createNotes,
  deleteNote,
  getListNotesQueryKey,
  listNotes,
  updateNote,
} from '@/lib/api/endpoints/default/default'
import { ApiError } from '@/lib/api/fetcher'
import type { UpdateNoteBodyOne } from '@/lib/api/models/updateNoteBodyOne'
import { type ListPage, type RestListResult, useInfiniteList } from '@/lib/api/use-infinite-list'
import { isRestEnabled } from '@/lib/backend-flags'
import { useSessionStore } from '@/lib/session/session.store'
import type { Note } from './note.types'

/** Server max is 100; 50 keeps the first paint light while still covering a typical visit in one page. */
export const NOTES_LIST_PARAMS = { pageSize: '50' } as const

function fromNoteResponse(raw: Record<string, unknown>): Note {
  return {
    id: raw.id as string,
    applicationId: raw.applicationId as string,
    text: (raw.text as string | undefined) ?? '',
    attachmentIds: (raw.attachmentIds as string[] | undefined) ?? [],
    metadata: (raw.metadata as Record<string, unknown> | undefined) ?? {},
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    deletedAt: null,
  }
}

/**
 * The feed's *unpaged* key — what every note op invalidates. `useInfiniteList`
 * appends `'infinite'`, which prefix matching still hits.
 */
export function notesQueryKey(orgId: string, projectId: string, applicationId: string) {
  return getListNotesQueryKey(orgId, projectId, applicationId, NOTES_LIST_PARAMS)
}

/** The key `useInfiniteList` actually stores the feed under (it appends `'infinite'` to the unpaged key). */
function notesInfiniteKey(orgId: string, projectId: string, applicationId: string) {
  return [...notesQueryKey(orgId, projectId, applicationId), 'infinite'] as const
}

/**
 * A single-note response. `f` unwraps a single object (PATCH answers the note
 * itself) but keeps a list as `{ data: [...] }` (create is a batch endpoint).
 */
export function noteFromResponse(response: unknown): Note | null {
  if (!response || typeof response !== 'object') return null
  const data = 'id' in response ? response : (response as { data?: unknown }).data
  const raw = Array.isArray(data) ? data[0] : data
  return raw && typeof raw === 'object' ? fromNoteResponse(raw as Record<string, unknown>) : null
}

/**
 * Writes an op's server answer straight into the cached feed pages, before the
 * outbox drops the op and the overlay stops covering for it. Without this the
 * feed reads the *stale* server list for the moment between "op resolved" and
 * "invalidation refetch landed": a new note vanishes and pops back, an edit
 * flips to the old text, a deleted note reappears. Same idea as the
 * application ops' `onServerResponse`. A feed never opened has no cache, and
 * nothing to fix.
 */
export function updateNotesCache(
  queryClient: QueryClient,
  orgId: string,
  projectId: string,
  applicationId: string,
  update: (notes: Note[], pageIndex: number) => Note[],
) {
  queryClient.setQueryData<InfiniteData<ListPage<Note>>>(
    notesInfiniteKey(orgId, projectId, applicationId),
    (current) =>
      current && {
        ...current,
        pages: current.pages.map((page, index) => ({
          ...page,
          items: update(page.items, index),
        })),
      },
  )
}

const MISSING_ATTACHMENTS = /anexo não encontrado nesta visita: (.+)$/

/** The attachment ids a create was refused over (422), or null for any other failure. */
function missingAttachmentIds(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.status !== 422) return null
  const message = (error.body as { error?: unknown } | null | undefined)?.error
  const match = typeof message === 'string' ? MISSING_ATTACHMENTS.exec(message) : null
  return match ? match[1].split(', ') : null
}

/**
 * The server answers 201 for a new note and 200 for a replay of an id it
 * already has (returned unchanged, not re-validated) — both resolve here, so a
 * replayed op never jams the outbox.
 *
 * A *first* send is validated, though: a photo deleted while this create sat in
 * the outbox (removed from the gallery before the library picker posted its
 * note) is answered 422, and a 4xx fails the head and blocks every write behind
 * it. Deleting an attachment server-side unlinks it from its notes and drops a
 * note left empty, so this does the same: retry without the missing ids, and
 * resolve to `null` — nothing created — when nothing is left to post.
 */
export async function createNoteRest(orgId: string, projectId: string, note: Note): Promise<unknown> {
  try {
    return await createNotes(orgId, projectId, note.applicationId, {
      notes: [
        {
          id: note.id,
          text: note.text,
          attachmentIds: note.attachmentIds,
          createdAt: note.createdAt,
        },
      ],
    })
  } catch (error) {
    const missing = missingAttachmentIds(error)
    if (!missing) throw error
    const attachmentIds = note.attachmentIds.filter((id) => !missing.includes(id))
    if (attachmentIds.length === note.attachmentIds.length) throw error
    if (!note.text.trim() && attachmentIds.length === 0) return null
    return createNoteRest(orgId, projectId, { ...note, attachmentIds })
  }
}

export interface PatchNoteArgs {
  applicationId: string
  noteId: string
  text?: string
  /** Replaces the whole list. Dropping an id only unlinks it; the file stays in the gallery. */
  attachmentIds?: string[]
  updatedAt: string
}

export function updateNoteRest(orgId: string, projectId: string, args: PatchNoteArgs) {
  const body: UpdateNoteBodyOne = {}
  if (args.text !== undefined) body.text = args.text
  if (args.attachmentIds !== undefined) body.attachmentIds = args.attachmentIds
  return updateNote(orgId, projectId, args.applicationId, args.noteId, body)
}

/** Server-side this also deletes attachments nothing else references (no other note, no checklist item). */
export function deleteNoteRest(orgId: string, projectId: string, applicationId: string, noteId: string) {
  return deleteNote(orgId, projectId, applicationId, noteId)
}

/**
 * The Activity feed's server read, paged newest-first (`createdAt DESC, id
 * DESC`). Offset paging shifts when new notes land between page fetches, so
 * the consumer must dedupe by id — `useNotesFeed` does.
 */
export function useNotesRestResult(applicationId: string): RestListResult<Note> | undefined {
  const activeOrgId = useSessionStore((state) => state.activeOrgId)
  const activeProjectId = useSessionStore((state) => state.activeProjectId)
  const enabled = isRestEnabled('note') && Boolean(activeOrgId && activeProjectId && applicationId)

  const fetchPage = useCallback(
    async (page: number): Promise<ListPage<Note>> => {
      const response = await listNotes(activeOrgId ?? '', activeProjectId ?? '', applicationId, {
        ...NOTES_LIST_PARAMS,
        page: String(page),
      })
      const envelope = response as unknown as {
        data: Record<string, unknown>[]
        meta?: { pagination?: { pageCount?: number } }
      }
      return {
        items: envelope.data.map(fromNoteResponse),
        pageCount: envelope.meta?.pagination?.pageCount ?? 1,
      }
    },
    [activeOrgId, activeProjectId, applicationId],
  )

  const result = useInfiniteList<Note>({
    queryKey: notesQueryKey(activeOrgId ?? '', activeProjectId ?? '', applicationId),
    enabled,
    fetchPage,
  })
  return enabled ? result : undefined
}
