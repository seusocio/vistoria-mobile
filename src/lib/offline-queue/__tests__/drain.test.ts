import { describe, expect, test } from 'bun:test'
import { create } from 'zustand'
import { drainOutboxWith } from '../drain'
import { defineOp } from '../ops'
import { createOutboxSlice, type OutboxState } from '../queue.store'
import { MAX_ATTEMPTS } from '../retry-policy'

function freshStore() {
  return create<OutboxState>()(createOutboxSlice)
}

let counter = 0
function uniqueType(prefix: string): string {
  counter += 1
  return `drain-test.${prefix}.${counter}`
}

describe('drainOutboxWith', () => {
  test('does nothing when the queue is empty', async () => {
    const store = freshStore()
    let calls = 0
    await drainOutboxWith(store, async () => {
      calls += 1
    })
    expect(calls).toBe(0)
  })

  test('resolves and removes an item whose mutation succeeds', async () => {
    const store = freshStore()
    const op = defineOp<Record<string, never>, unknown>(uniqueType('success'), {
      mutation: {} as never,
      applyLocal: (entity) => entity as never,
      entityId: () => 'e',
    })
    store.getState().enqueue(op, {})

    await drainOutboxWith(store, async () => undefined)

    expect(store.getState().items).toHaveLength(0)
  })

  test('drains multiple pending items in enqueue order on success', async () => {
    const store = freshStore()
    const op = defineOp<{ n: number }, unknown>(uniqueType('order'), {
      mutation: {} as never,
      applyLocal: (entity) => entity as never,
      entityId: (args) => `e-${args.n}`,
    })
    store.getState().enqueue(op, { n: 1 })
    store.getState().enqueue(op, { n: 2 })

    const seen: number[] = []
    await drainOutboxWith(store, async (_mutation, args) => {
      seen.push((args as { n: number }).n)
    })

    expect(seen).toEqual([1, 2])
    expect(store.getState().items).toHaveLength(0)
  })

  test('on failure, bumps attempts, keeps the item pending, and stops before later items', async () => {
    const store = freshStore()
    const failing = defineOp<{ n: number }, unknown>(uniqueType('fail-first'), {
      mutation: {} as never,
      applyLocal: (entity) => entity as never,
      entityId: (args) => `e-${args.n}`,
    })
    store.getState().enqueue(failing, { n: 1 })
    store.getState().enqueue(failing, { n: 2 })

    const seen: number[] = []
    await drainOutboxWith(
      store,
      async (_mutation, args) => {
        seen.push((args as { n: number }).n)
        throw new Error('network down')
      },
      () => {}, // no-op scheduler: don't leave a real retry timer running past this test
    )

    // Only the first item was attempted — the drain stopped instead of
    // skipping ahead to the second, preserving FIFO order under retry.
    expect(seen).toEqual([1])
    expect(store.getState().items).toHaveLength(2)
    expect(store.getState().items[0]).toMatchObject({ attempts: 1, status: 'pending' })
    expect(store.getState().items[1]).toMatchObject({ attempts: 0, status: 'pending' })
  })

  test('marks the item failed (not discarded) once attempts are exhausted', async () => {
    const store = freshStore()
    const op = defineOp<Record<string, never>, unknown>(uniqueType('exhausted'), {
      mutation: {} as never,
      applyLocal: (entity) => entity as never,
      entityId: () => 'e',
    })
    store.getState().enqueue(op, {})
    const { id } = store.getState().items[0]
    // Fast-forward to one attempt away from the limit.
    for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) store.getState().retry(id)

    await drainOutboxWith(store, async () => {
      throw new Error('still down')
    })

    expect(store.getState().items).toHaveLength(1)
    expect(store.getState().items[0].status).toBe('failed')
  })
})
