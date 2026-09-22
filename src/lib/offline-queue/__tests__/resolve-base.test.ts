import { describe, expect, test } from 'bun:test'
import { resolveOverlayBase } from '../overlay'

/**
 * Regression suite for the airplane-mode bug: every screen sat on a spinner
 * with no network, because `useQuery` never resolves without a socket and
 * the overlay read that `undefined` as "still loading".
 */
describe('resolveOverlayBase', () => {
  const base = { snapshotsHydrated: true, connected: true }

  test("the server's answer always wins", () => {
    expect(
      resolveOverlayBase({ ...base, server: 'fresh', cached: 'stale' }),
    ).toEqual({ value: 'fresh', settled: true })
  })

  test('falls back to the persisted snapshot when the server has not answered', () => {
    expect(
      resolveOverlayBase({ ...base, server: undefined, cached: 'stale' }),
    ).toEqual({ value: 'stale', settled: true })
  })

  test('waits while the snapshots are still being read from disk', () => {
    // The cache may well hold this query — we just don't know yet, and
    // answering "nothing" here would flash an empty screen on every launch.
    expect(
      resolveOverlayBase({
        server: undefined,
        cached: undefined,
        snapshotsHydrated: false,
        connected: false,
      }),
    ).toEqual({ value: undefined, settled: false })
  })

  test('waits while connected: the answer is genuinely in flight', () => {
    expect(
      resolveOverlayBase({ ...base, server: undefined, cached: undefined }),
    ).toEqual({ value: undefined, settled: false })
  })

  test('offline with no cache is an answer, not a wait', () => {
    // This is the airplane-mode case. `settled: true` is what lets a list
    // resolve to [] and a screen render instead of spinning forever.
    expect(
      resolveOverlayBase({
        server: undefined,
        cached: undefined,
        snapshotsHydrated: true,
        connected: false,
      }),
    ).toEqual({ value: undefined, settled: true })
  })

  test('a cached null is a real answer, not a missing one', () => {
    expect(
      resolveOverlayBase<string | null>({ ...base, server: undefined, cached: null }),
    ).toEqual({ value: null, settled: true })
  })
})
