import { describe, expect, test } from 'bun:test'
import { backoffMs, MAX_ATTEMPTS } from '../retry-policy'

describe('backoffMs', () => {
  test('grows exponentially with jitter on top', () => {
    const first = backoffMs(1)
    const second = backoffMs(2)
    const third = backoffMs(3)
    // jitter can push a smaller base above a larger one's *minimum*, but the
    // minimum (no-jitter) bound must still climb attempt over attempt.
    expect(first).toBeGreaterThanOrEqual(1_000)
    expect(first).toBeLessThan(1_000 * 1.2 + 1)
    expect(second).toBeGreaterThanOrEqual(2_000)
    expect(third).toBeGreaterThanOrEqual(4_000)
  })

  test('caps at 30s regardless of attempt count', () => {
    const far = backoffMs(20)
    expect(far).toBeLessThanOrEqual(30_000 * 1.2)
    expect(far).toBeGreaterThanOrEqual(30_000)
  })

  test('MAX_ATTEMPTS is a small positive integer', () => {
    expect(MAX_ATTEMPTS).toBeGreaterThan(0)
    expect(Number.isInteger(MAX_ATTEMPTS)).toBe(true)
  })
})
