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
      kind: 'application',
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
      kind: 'application',
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
      kind: 'application',
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
      kind: 'application',
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

  test('a failed head blocks the queue instead of being stepped over', async () => {
    // The whole point of FIFO: a later op routinely targets the entity an
    // earlier one creates, and the server answers a patch against a missing
    // row with `return null` — the write disappears with no error anywhere.
    const store = freshStore()
    const op = defineOp<{ n: number }, unknown>(uniqueType('blocked'), {
      kind: 'application',
      mutation: {} as never,
      applyLocal: (entity) => entity as never,
      entityId: (args) => `e-${args.n}`,
    })
    store.getState().enqueue(op, { n: 1 })
    store.getState().enqueue(op, { n: 2 })
    store.getState().fail(store.getState().items[0].id)

    const seen: number[] = []
    await drainOutboxWith(store, async (_mutation, args) => {
      seen.push((args as { n: number }).n)
    })

    expect(seen).toEqual([])
    expect(store.getState().items).toHaveLength(2)
  })

  test('retryFailed gives the blocked head a new budget and the queue drains', async () => {
    const store = freshStore()
    const op = defineOp<{ n: number }, unknown>(uniqueType('unblocked'), {
      kind: 'application',
      mutation: {} as never,
      applyLocal: (entity) => entity as never,
      entityId: (args) => `e-${args.n}`,
    })
    store.getState().enqueue(op, { n: 1 })
    store.getState().enqueue(op, { n: 2 })
    store.getState().fail(store.getState().items[0].id)

    store.getState().retryFailed()

    const seen: number[] = []
    await drainOutboxWith(store, async (_mutation, args) => {
      seen.push((args as { n: number }).n)
    })

    expect(seen).toEqual([1, 2])
    expect(store.getState().items).toHaveLength(0)
    expect(store.getState().items).toEqual([])
  })

  test('an op type this build no longer defines is failed, not thrown on', async () => {
    const store = freshStore()
    const op = defineOp<Record<string, never>, unknown>(uniqueType('vanishing'), {
      kind: 'application',
      mutation: {} as never,
      applyLocal: (entity) => entity as never,
      entityId: () => 'e',
    })
    store.getState().enqueue(op, {})
    // Simulate a queue persisted by a build that had an op this one doesn't.
    store.setState((state) => ({
      items: state.items.map((item) => ({ ...item, type: 'drain-test.removed-in-this-build' })),
    }))

    let calls = 0
    await drainOutboxWith(store, async () => {
      calls += 1
    })

    expect(calls).toBe(0)
    expect(store.getState().items[0].status).toBe('failed')
  })
})
