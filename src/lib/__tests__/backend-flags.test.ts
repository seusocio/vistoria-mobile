import { describe, expect, test } from 'bun:test'
import { isRestEnabled } from '../backend-flags'

describe('isRestEnabled', () => {
  test('every entity kind is off until its seam is cut', () => {
    expect(isRestEnabled('application')).toBe(false)
    expect(isRestEnabled('checklist')).toBe(false)
    expect(isRestEnabled('tag')).toBe(false)
  })
})
