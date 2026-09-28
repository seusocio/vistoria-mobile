import { describe, expect, test } from 'bun:test'
import { isRestEnabled } from '../backend-flags'

describe('isRestEnabled', () => {
  test('every entity has cut over to REST, per ticket #3', () => {
    expect(isRestEnabled('checklist')).toBe(true)
    expect(isRestEnabled('tag')).toBe(true)
    expect(isRestEnabled('application')).toBe(true)
  })
})
