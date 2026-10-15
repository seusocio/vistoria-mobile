import { refreshApplicationCache } from '@/features/application/shared/application.cache'
import { isApplicationGone } from '@/features/application/shared/application.rest'
import { defineOp } from '@/lib/offline-queue/ops'
import { requireActiveProject } from '@/lib/session/require-active-project'
import {
  createNoteRest,
  deleteNoteRest,
  noteFromResponse,
  notesQueryKey,
  type PatchNoteArgs,
  updateNoteRest,
  updateNotesCache,
} from './note.rest'
import type { Note } from './note.types'

function invalidateFeed(args: { applicationId: string }) {
  const { orgId, projectId } = requireActiveProject('notes')
  return [notesQueryKey(orgId, projectId, args.applicationId)]
}

/**
 * Insert-if-absent on the server (a replayed id answers 200 with the stored
 * row), so replaying after a process kill is safe.
 *
 * Ordering contract: every id in `attachmentIds` must already exist on the
 * server for this Visita, or the create is answered 422. Callers enqueue the
 * attachment's `applications.addAttachment` op *before* this one; the outbox
 * drains FIFO, so the row exists by the time this runs. The binary upload
 * itself may still be pending — the server only needs the row.
 */
export const createNote = defineOp<{ note: Note }, Note>('notes.create', {
  kind: 'note',
  scope: (args) => args.note.applicationId,
  isScopeGone: isApplicationGone,
  send: (args) => {
    const { orgId, projectId } = requireActiveProject('notes')
    return createNoteRest(orgId, projectId, args.note)
  },
  applyLocal: (entity, args) => entity ?? args.note,
  entityId: (args) => args.note.id,
  onServerResponse: (queryClient, args, response) => {
    const { orgId, projectId } = requireActiveProject('notes')
    // Every attachment was deleted before this landed — see `createNoteRest`.
    if (response === null) return
    const created = noteFromResponse(response) ?? args.note
    updateNotesCache(queryClient, orgId, projectId, args.note.applicationId, (notes, pageIndex) =>
      pageIndex === 0 && !notes.some((note) => note.id === created.id) ? [created, ...notes] : notes,
    )
  },
  invalidates: (args) => invalidateFeed(args.note),
})

export const patchNote = defineOp<PatchNoteArgs, Note>('notes.patch', {
  kind: 'note',
  scope: (args) => args.applicationId,
  isScopeGone: isApplicationGone,
  // The note is gone: deleted before this landed (a transcription finishing
  // after the user removed its voice note), or dropped server-side when its
  // last attachment was deleted. There is nothing left to patch.
  treatNotFoundAsDone: true,
  send: (args) => {
    const { orgId, projectId } = requireActiveProject('notes')
    return updateNoteRest(orgId, projectId, args)
  },
  applyLocal: (entity, args) => {
    if (!entity) return null
    return {
      ...entity,
      ...(args.text !== undefined ? { text: args.text } : {}),
      ...(args.attachmentIds !== undefined ? { attachmentIds: args.attachmentIds } : {}),
      updatedAt: args.updatedAt,
    }
  },
  entityId: (args) => args.noteId,
  onServerResponse: (queryClient, args, response) => {
    const { orgId, projectId } = requireActiveProject('notes')
    const updated = noteFromResponse(response)
    updateNotesCache(queryClient, orgId, projectId, args.applicationId, (notes) =>
      notes.map((note) =>
        note.id !== args.noteId
          ? note
          : (updated ?? {
              ...note,
              ...(args.text !== undefined ? { text: args.text } : {}),
              ...(args.attachmentIds !== undefined ? { attachmentIds: args.attachmentIds } : {}),
            }),
      ),
    )
  },
  invalidates: invalidateFeed,
})

/**
 * Hides the row locally via `deletedAt` (returning `null` would leave a hole
 * in a server list the overlay patches in place). Server-side the delete also
 * removes attachments only this note used, so the application's attachment
 * list is refreshed too.
 */
export const deleteNoteOp = defineOp<{ applicationId: string; noteId: string; deletedAt: string }, Note>(
  'notes.delete',
  {
    kind: 'note',
    scope: (args) => args.applicationId,
    isScopeGone: isApplicationGone,
    treatNotFoundAsDone: true,
    send: (args) => {
      const { orgId, projectId } = requireActiveProject('notes')
      return deleteNoteRest(orgId, projectId, args.applicationId, args.noteId)
    },
    applyLocal: (entity, args) => (entity ? { ...entity, deletedAt: args.deletedAt } : null),
    entityId: (args) => args.noteId,
    onServerResponse: (queryClient, args) => {
      const { orgId, projectId } = requireActiveProject('notes')
      updateNotesCache(queryClient, orgId, projectId, args.applicationId, (notes) =>
        notes.filter((note) => note.id !== args.noteId),
      )
      void refreshApplicationCache(queryClient, orgId, projectId, args.applicationId)
    },
    invalidates: invalidateFeed,
  },
)
