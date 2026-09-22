import { describe, expect, test } from 'bun:test'
import { create } from 'zustand'
import { defineOp } from '../ops'
import { createOutboxSlice, type OutboxState } from '../queue.store'

/** A throwaway, purely in-memory store — no `persist`, no AsyncStorage. */
function freshStore() {
  return create<OutboxState>()(createOutboxSlice)
}

describe('outbox slice', () => {
  test('enqueue derives entityId and type from the op, and starts pending with 0 attempts', () => {
    const store = freshStore()
    const op = defineOp<{ applicationId: string }, unknown>('queue-store-test.touch', {
      kind: 'application',
      mutation: {} as never,
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
      mutation: {} as never,
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
      mutation: {} as never,
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
      mutation: {} as never,
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
