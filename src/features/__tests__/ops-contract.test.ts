import { describe, expect, mock, test } from 'bun:test'
import { ApiError } from '@/lib/api/fetcher'
import { type EntityKind, getOp } from '@/lib/offline-queue/ops'

/*
 * Every op's decided answer to "what if the server answers 4xx for this
 * forever?" (ADRs 0001 and 0002). The outbox is FIFO, so getting one of these
 * wrong blocks every write behind it — and nothing else fails to compile.
 * Moving or splitting an `*.ops.ts` file must leave this table unchanged.
 */

// The feed hooks reach `react-native`.
mock.module('@/lib/api/use-infinite-list', () => ({ useInfiniteList: () => undefined }))

await import('@/features/ops')

type Policy = { kind: EntityKind; treatNotFoundAsDone: boolean; bestEffort: boolean; scoped: boolean }

const EXPECTED: Record<string, Policy> = {
  'applications.create': { kind: 'application', treatNotFoundAsDone: false, bestEffort: false, scoped: true },
  'applications.patchItem': { kind: 'application', treatNotFoundAsDone: false, bestEffort: false, scoped: true },
  'applications.addItem': { kind: 'application', treatNotFoundAsDone: false, bestEffort: false, scoped: true },
  'applications.updateMeta': { kind: 'application', treatNotFoundAsDone: false, bestEffort: false, scoped: true },
  'applications.softDelete': { kind: 'application', treatNotFoundAsDone: true, bestEffort: false, scoped: true },
  'applications.addAttachment': { kind: 'application', treatNotFoundAsDone: false, bestEffort: false, scoped: true },
  'applications.deleteAttachment': { kind: 'application', treatNotFoundAsDone: true, bestEffort: false, scoped: true },
  'applications.setAttachmentUploaded': { kind: 'application', treatNotFoundAsDone: true, bestEffort: false, scoped: true },
  'applications.setAttachmentUploadStatus': { kind: 'application', treatNotFoundAsDone: false, bestEffort: true, scoped: true },
  'notes.create': { kind: 'note', treatNotFoundAsDone: false, bestEffort: false, scoped: true },
  'notes.patch': { kind: 'note', treatNotFoundAsDone: true, bestEffort: false, scoped: true },
  'notes.delete': { kind: 'note', treatNotFoundAsDone: true, bestEffort: false, scoped: true },
  'checklists.save': { kind: 'checklist', treatNotFoundAsDone: false, bestEffort: false, scoped: false },
  'checklists.softDeleteCascade': { kind: 'checklist', treatNotFoundAsDone: true, bestEffort: false, scoped: false },
  'tags.create': { kind: 'tag', treatNotFoundAsDone: false, bestEffort: false, scoped: false },
}

describe('op registry', () => {
  test.each(Object.entries(EXPECTED))('%s keeps its 4xx policy', (type, expected) => {
    const definition = getOp(type)
    expect(definition).toBeDefined()
    expect({
      kind: definition?.kind,
      treatNotFoundAsDone: Boolean(definition?.treatNotFoundAsDone),
      bestEffort: Boolean(definition?.bestEffort),
      scoped: Boolean(definition?.isScopeGone),
    }).toEqual(expected)
  })

  test('ops under a Visita recognize "the Visita was deleted" and nothing else', () => {
    const gone = new ApiError(404, 'Not Found', { error: 'aplicação não encontrada' })
    const otherNotFound = new ApiError(404, 'Not Found', { error: 'anexo não encontrado' })
    for (const [type, { scoped }] of Object.entries(EXPECTED)) {
      if (!scoped) continue
      expect(getOp(type)?.isScopeGone?.(gone)).toBe(true)
      expect(getOp(type)?.isScopeGone?.(otherNotFound)).toBe(false)
    }
  })
})
