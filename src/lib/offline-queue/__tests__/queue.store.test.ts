import { describe, expect, test } from 'bun:test'
import { create } from 'zustand'
import { defineOp } from '../ops'
import {
  createOutboxSlice,
  type OutboxState,
  type QueuedOp,
  retargetLegacyConvexItems,
} from '../queue.store'

/** A throwaway, purely in-memory store — no `persist`, no AsyncStorage. */
function freshStore() {
  return create<OutboxState>()(createOutboxSlice)
}

describe('outbox slice', () => {
  test('enqueue derives entityId and type from the op, and starts pending with 0 attempts', () => {
    const store = freshStore()
    const op = defineOp<{ applicationId: string }, unknown>('queue-store-test.touch', {
      kind: 'application',
      send: {} as never,
      applyLocal: (entity) => entity as never,
      entityId: (args) => args.applicationId,
    })

    store.getState().enqueue(op, { applicationId: 'app-1' })

    const [item] = store.getState().items
    expect(item.type).toBe('queue-store-test.touch')
    expect(item.entityId).toBe('app-1')
    expect(item.attempts).toBe(0)
    expect(item.status).toBe('pending')
  })

  test('resolve removes the item', () => {
    const store = freshStore()
    const op = defineOp<Record<string, never>, unknown>('queue-store-test.resolve', {
      kind: 'application',
      send: {} as never,
      applyLocal: (entity) => entity as never,
      entityId: () => 'e',
    })
    store.getState().enqueue(op, {})
    const { id } = store.getState().items[0]

    store.getState().resolve(id)

    expect(store.getState().items).toHaveLength(0)
  })

  test('retry bumps attempts and keeps the item pending', () => {
    const store = freshStore()
    const op = defineOp<Record<string, never>, unknown>('queue-store-test.retry', {
      kind: 'application',
      send: {} as never,
      applyLocal: (entity) => entity as never,
      entityId: () => 'e',
    })
    store.getState().enqueue(op, {})
    const { id } = store.getState().items[0]

    store.getState().retry(id)

    expect(store.getState().items[0]).toMatchObject({ attempts: 1, status: 'pending' })
  })

  test('fail marks the item failed instead of discarding it', () => {
    const store = freshStore()
    const op = defineOp<Record<string, never>, unknown>('queue-store-test.fail', {
      kind: 'application',
      send: {} as never,
      applyLocal: (entity) => entity as never,
      entityId: () => 'e',
    })
    store.getState().enqueue(op, {})
    const { id } = store.getState().items[0]

    store.getState().fail(id)

    expect(store.getState().items).toHaveLength(1)
    expect(store.getState().items[0].status).toBe('failed')
  })
})

describe('retargetLegacyConvexItems', () => {
  /** A checklist read from a Convex query and queued before `castConvex` existed. */
  function legacyItem(overrides: Partial<QueuedOp> = {}): QueuedOp {
    return {
      id: 'op_legacy',
      type: 'checklists.save',
      kind: 'checklist',
      entityId: 'checklist_mu5gcevf9r5ln5pg3h',
      args: {
        id: 'checklist_mu5gcevf9r5ln5pg3h',
        entity: {
          _id: 'kn72qzbsfd9pzj5q9e8d3zrsgn8ekjh5',
          _creationTime: 1789644864208.7083,
          id: 'checklist_mu5gcevf9r5ln5pg3h',
          title: 'VISTORIA PRD',
        },
      },
      attempts: 3,
      enqueuedAt: '2026-09-19T21:08:11.621Z',
      status: 'failed',
      ...overrides,
    }
  }

  test('re-targets a Convex-era item at REST, strips system fields and resets its budget', () => {
    const [item] = retargetLegacyConvexItems([legacyItem()])

    expect(item.backend).toBe('rest')
    expect(item.args).toEqual({
      id: 'checklist_mu5gcevf9r5ln5pg3h',
      entity: { id: 'checklist_mu5gcevf9r5ln5pg3h', title: 'VISTORIA PRD' },
    })
    expect(item.attempts).toBe(0)
    expect(item.status).toBe('pending')
  })

  test('leaves an item already targeting REST untouched', () => {
    const rest = legacyItem({ backend: 'rest', attempts: 2, status: 'failed' })
    expect(retargetLegacyConvexItems([rest])[0]).toBe(rest)
  })

  test('keeps args without an `entity` as they are', () => {
    const [item] = retargetLegacyConvexItems([
      legacyItem({ type: 'checklists.softDeleteCascade', args: { id: 'c1', deletedAt: 'now' } }),
    ])
    expect(item.args).toEqual({ id: 'c1', deletedAt: 'now' })
    expect(item.backend).toBe('rest')
  })
})
