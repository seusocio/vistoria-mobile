import type { FunctionReference } from 'convex/server'
import type { StoreApi } from 'zustand'
import { getOp } from './ops'
import type { OutboxState } from './queue.store'
import { backoffMs, MAX_ATTEMPTS } from './retry-policy'

export type MutationRunner = (
  mutation: FunctionReference<'mutation'>,
  args: Record<string, unknown>,
) => Promise<unknown>
export type Scheduler = (run: () => void, delayMs: number) => void

let draining = false
let retryTimer: ReturnType<typeof setTimeout> | null = null

const defaultScheduler: Scheduler = (run, delayMs) => {
  if (retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    run()
  }, delayMs)
}

/**
 * The drain algorithm, decoupled from the real outbox singleton, the real
 * Convex client, and real timers so it can run in tests against a
 * throwaway store, a fake mutation runner, and a no-op scheduler.
 * `process-queue.ts` wires this to the real ones.
 *
 * Drains FIFO, one item at a time, oldest first. Stops on the first
 * failure instead of skipping ahead: a later op may target an entity this
 * one creates (`patchItems` after the `create` it patches), so order has
 * to survive retries, not just the happy path.
 */
export async function drainOutboxWith(
  outbox: Pick<StoreApi<OutboxState>, 'getState'>,
  runMutation: MutationRunner,
  schedule: Scheduler = defaultScheduler,
): Promise<void> {
  if (draining) return
  draining = true
  try {
    for (;;) {
      const item = outbox.getState().items.find((candidate) => candidate.status === 'pending')
      if (!item) return
      const op = getOp(item.type)
      try {
        await runMutation(op.mutation, item.args as Record<string, unknown>)
        outbox.getState().resolve(item.id)
      } catch {
        const attempts = item.attempts + 1
        if (attempts >= MAX_ATTEMPTS) {
          outbox.getState().fail(item.id)
        } else {
          outbox.getState().retry(item.id)
          schedule(() => void drainOutboxWith(outbox, runMutation, schedule), backoffMs(attempts))
        }
        return
      }
    }
  } finally {
    draining = false
  }
}
