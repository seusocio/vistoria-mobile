/** After this many failed attempts, an op is marked `failed` and drainage stops on it. */
export const MAX_ATTEMPTS = 5

const BASE_DELAY_MS = 1_000
const MAX_DELAY_MS = 30_000
const JITTER_RATIO = 0.2

/** Exponential backoff with jitter, capped at 30s. `attempt` is 1-based. */
export function backoffMs(attempt: number): number {
  const base = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1))
  return base + Math.random() * base * JITTER_RATIO
}
