import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { ApiError } from '@/lib/api/fetcher'
import type { Note } from '../note.types'

type CreateBody = { notes: Array<{ id: string; attachmentIds: string[] }> }

/** What the server still has; any other attachment id answers 422 like `assertAttachmentsBelong`. */
let existing = new Set<string>()
let sent: string[][] = []
let failWith: Error | null = null

mock.module('@/lib/api/endpoints/default/default', () => ({
  createNotes: async (_org: string, _project: string, _app: string, body: CreateBody) => {
    if (failWith) throw failWith
    const ids = body.notes[0].attachmentIds
    sent.push(ids)
    const missing = ids.filter((id) => !existing.has(id))
    if (missing.length > 0) {
      const error = `anexo não encontrado nesta visita: ${missing.join(', ')}`
      throw new ApiError(422, 'Unprocessable Entity', { error })
    }
    return { data: [{ ...body.notes[0] }] }
  },
  deleteNote: async () => undefined,
  getListNotesQueryKey: () => [],
  listNotes: async () => ({ data: [] }),
  updateNote: async () => undefined,
}))

// The feed hook's imports reach `react-native` (via `useIsOnline`), which `bun test` can't parse.
mock.module('@/lib/api/use-infinite-list', () => ({ useInfiniteList: () => undefined }))

const { createNoteRest } = await import('../note.rest')

function note(overrides: Partial<Note>): Note {
  return {
    id: 'note_1',
    applicationId: 'app_1',
    text: '',
    attachmentIds: [],
    metadata: {},
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-15T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('createNoteRest', () => {
  beforeEach(() => {
    existing = new Set()
    sent = []
    failWith = null
  })

  test('retries without attachments deleted while the create was queued', async () => {
    existing = new Set(['a2'])
    const response = await createNoteRest('org', 'proj', note({ attachmentIds: ['a1', 'a2', 'a3'] }))
    expect(sent).toEqual([['a1', 'a2', 'a3'], ['a2']])
    expect(response).toEqual({ data: [{ id: 'note_1', text: '', attachmentIds: ['a2'], createdAt: '2026-10-15T00:00:00.000Z' }] })
  })

  test('resolves to null when every attachment is gone and there is no text', async () => {
    const response = await createNoteRest('org', 'proj', note({ attachmentIds: ['a1', 'a2'] }))
    expect(response).toBeNull()
    expect(sent).toEqual([['a1', 'a2']])
  })

  test('keeps a captioned note when all its photos are gone', async () => {
    await createNoteRest('org', 'proj', note({ text: 'parede trincada', attachmentIds: ['a1'] }))
    expect(sent).toEqual([['a1'], []])
  })

  test('rethrows any other failure so the drain retries or fails it as before', async () => {
    failWith = new ApiError(503, 'Service Unavailable', { error: 'indisponível' })
    await expect(createNoteRest('org', 'proj', note({ attachmentIds: ['a1'] }))).rejects.toBe(failWith)
  })
})
