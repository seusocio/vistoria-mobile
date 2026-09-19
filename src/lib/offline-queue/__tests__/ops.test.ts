import { describe, expect, test } from 'bun:test'
import { defineOp, getOp } from '../ops'

describe('defineOp / getOp', () => {
  test('registers an op and getOp finds it back by type', () => {
    const op = defineOp<{ id: string }, { id: string }>('ops-test.create', {
      mutation: {} as never,
      applyLocal: (_entity, args) => ({ id: args.id }),
      entityId: (args) => args.id,
    })
    expect(getOp('ops-test.create')).toBe(op as never)
  })

  test('throws when the same type is defined twice', () => {
    defineOp('ops-test.duplicate', {
      mutation: {} as never,
      applyLocal: (entity) => entity,
      entityId: () => 'x',
    })
    expect(() =>
      defineOp('ops-test.duplicate', {
        mutation: {} as never,
        applyLocal: (entity) => entity,
        entityId: () => 'x',
      }),
    ).toThrow(/already defined/)
  })

  test('throws a descriptive error for an unregistered type', () => {
    expect(() => getOp('ops-test.never-registered')).toThrow(/unknown op/)
  })
})
