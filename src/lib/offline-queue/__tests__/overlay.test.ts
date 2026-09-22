import { describe, expect, test } from 'bun:test'
import { defineOp, type EntityKind } from '../ops'
import { applyOps, mergePendingIntoList } from '../overlay'
import type { QueuedOp } from '../queue.store'

interface FakeItem {
  id: string
  answer: string | null
  updatedAt: string
}

function op(
  id: string,
  type: string,
  args: unknown,
  entityId: string,
  kind: EntityKind = 'application',
): QueuedOp {
  return {
    id,
    type,
    kind,
    args,
    entityId,
    attempts: 0,
    enqueuedAt: '2026-01-01T00:00:00.000Z',
    status: 'pending',
  }
}

describe('applyOps', () => {
  test('folds pending ops onto the server entity in enqueue order', () => {
    defineOp<{ answer: string; updatedAt: string }, FakeItem>('overlay-test.setAnswer', {
      kind: 'application',
      mutation: {} as never,
      applyLocal: (entity, args) => ({ ...(entity as FakeItem), answer: args.answer, updatedAt: args.updatedAt }),
      entityId: () => 'item-1',
    })

    const server: FakeItem = { id: 'item-1', answer: null, updatedAt: '2026-01-01T00:00:00.000Z' }
    const ops = [
      op('op-1', 'overlay-test.setAnswer', { answer: 'Sim', updatedAt: '2026-01-01T00:00:01.000Z' }, 'item-1'),
      op('op-2', 'overlay-test.setAnswer', { answer: 'Não', updatedAt: '2026-01-01T00:00:02.000Z' }, 'item-1'),
    ]

    const result = applyOps(server, ops)
    expect(result).toEqual({ id: 'item-1', answer: 'Não', updatedAt: '2026-01-01T00:00:02.000Z' })
  })

  test('with a null entity, a create-style op builds the entity from scratch', () => {
    defineOp<{ id: string; title: string }, { id: string; title: string }>('overlay-test.create', {
      kind: 'application',
      mutation: {} as never,
      applyLocal: (_entity, args) => ({ id: args.id, title: args.title }),
      entityId: (args) => args.id,
    })

    const result = applyOps<{ id: string; title: string }>(null, [
      op('op-3', 'overlay-test.create', { id: 'entity-1', title: 'Nova vistoria' }, 'entity-1'),
    ])
    expect(result).toEqual({ id: 'entity-1', title: 'Nova vistoria' })
  })

  test('returns the entity untouched when there are no pending ops', () => {
    const server: FakeItem = { id: 'item-2', answer: 'Sim', updatedAt: '2026-01-01T00:00:00.000Z' }
    expect(applyOps(server, [])).toBe(server)
  })

  test('a patch-style op given a null entity returns null instead of crashing', () => {
    // Regression: a real device crash ("Cannot read property 'items' of
    // null"). The entity a patch targets can genuinely not exist yet on the
    // server (a create still in flight, a slow reconnect) — a patch-style
    // applyLocal must mirror the Convex handler's own `if (!entity) return
    // null` guard instead of casting `entity as Entity` and touching its
    // fields, which turns that ordinary condition into a crash.
    defineOp<{ answer: string }, FakeItem>('overlay-test.patch-on-missing', {
      kind: 'application',
      mutation: {} as never,
      applyLocal: (entity, args) => {
        if (!entity) return null
        return { ...entity, answer: args.answer }
      },
      entityId: () => 'item-missing',
    })

    const result = applyOps<FakeItem>(null, [
      op('op-4', 'overlay-test.patch-on-missing', { answer: 'Sim' }, 'item-missing'),
    ])
    expect(result).toBeNull()
  })
})

describe('mergePendingIntoList', () => {
  const getId = (entity: { id: string; title: string }) => entity.id

  test('appends an entity the server does not have yet', () => {
    defineOp<{ id: string; title: string }, { id: string; title: string }>('list-test.create', {
      kind: 'application',
      mutation: {} as never,
      applyLocal: (entity, args) => entity ?? { id: args.id, title: args.title },
      entityId: (args) => args.id,
    })

    const merged = mergePendingIntoList(
      [{ id: 'a-1', title: 'Servidor' }],
      [op('op-1', 'list-test.create', { id: 'a-2', title: 'Offline' }, 'a-2')],
      { kind: 'application', getId },
    )

    expect(merged.map(getId)).toEqual(['a-2', 'a-1'])
  })

  test('skips a locally-created entity that does not belong to a filtered list', () => {
    // `listByChecklistId` is already filtered server-side, so a vistoria
    // created offline under a *different* checklist must not be merged in.
    const merged = mergePendingIntoList<{ id: string; title: string; checklistId?: string }>(
      [],
      [op('op-2', 'list-test.create', { id: 'a-3', title: 'Outro checklist' }, 'a-3')],
      {
        kind: 'application',
        getId,
        belongs: (entity) => entity.checklistId === 'c-1',
      },
    )

    expect(merged).toEqual([])
  })

  test('an op of another kind never reaches the list', () => {
    // Regression: `checklistSave.applyLocal` returns its whole entity
    // regardless of what it was handed, so a pending checklist edit used to
    // be merged into the applications list as a phantom row — inflating the
    // Library's count with an object that is not an application at all.
    defineOp<{ id: string; title: string }, { id: string; title: string }>('list-test.checklist-save', {
      kind: 'checklist',
      mutation: {} as never,
      applyLocal: (_entity, args) => ({ id: args.id, title: args.title }),
      entityId: (args) => args.id,
    })

    const pending = [
      op('op-3', 'list-test.checklist-save', { id: 'c-9', title: 'Checklist' }, 'c-9', 'checklist'),
    ]
    const applicationOps = pending.filter((item) => item.kind === 'application')

    expect(mergePendingIntoList([], applicationOps, { kind: 'application', getId })).toEqual([])
  })
})
