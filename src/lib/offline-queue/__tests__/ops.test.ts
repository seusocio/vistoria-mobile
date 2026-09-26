import { describe, expect, test } from 'bun:test'
import { defineOp, getOp } from '../ops'

describe('defineOp / getOp', () => {
  test('registers an op and getOp finds it back by type', () => {
    const op = defineOp<{ id: string }, { id: string }>('ops-test.create', {
      kind: 'application',
      send: {} as never,
      applyLocal: (_entity, args) => ({ id: args.id }),
      entityId: (args) => args.id,
    })
    expect(getOp('ops-test.create')).toBe(op as never)
  })

  test('throws when the same type is defined twice', () => {
    defineOp('ops-test.duplicate', {
      kind: 'application',
      send: {} as never,
      applyLocal: (entity) => entity,
      entityId: () => 'x',
    })
    expect(() =>
      defineOp('ops-test.duplicate', {
        kind: 'application',
        send: {} as never,
        applyLocal: (entity) => entity,
        entityId: () => 'x',
      }),
    ).toThrow(/already defined/)
  })

  test('returns undefined for an unregistered type instead of throwing', () => {
    // The overlay calls this during render. A persisted op from an older
    // build — one whose op was renamed or removed — must not take the screen
    // down with it; the drain surfaces that case as a failed op instead.
    expect(getOp('ops-test.never-registered')).toBeUndefined()
  })
})
