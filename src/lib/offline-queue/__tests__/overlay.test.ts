import { describe, expect, test } from 'bun:test'
import { defineOp } from '../ops'
import { applyOps } from '../overlay'
import type { QueuedOp } from '../queue.store'

interface FakeItem {
  id: string
  answer: string | null
  updatedAt: string
}

function op(id: string, type: string, args: unknown, entityId: string): QueuedOp {
  return { id, type, args, entityId, attempts: 0, enqueuedAt: '2026-01-01T00:00:00.000Z', status: 'pending' }
}

describe('applyOps', () => {
  test('folds pending ops onto the server entity in enqueue order', () => {
    defineOp<{ answer: string; updatedAt: string }, FakeItem>('overlay-test.setAnswer', {
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
