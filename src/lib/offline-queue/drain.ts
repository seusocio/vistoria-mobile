import type { QueryClient } from '@tanstack/react-query'
import type { StoreApi } from 'zustand'
import { getOp } from './ops'
import type { OutboxState } from './queue.store'
import { backoffMs, MAX_ATTEMPTS } from './retry-policy'

export type MutationRunner = (
  send: (args: Record<string, unknown>) => Promise<unknown>,
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
 * Drains strictly FIFO: always the head of the queue, never a later item.
 * A later op routinely depends on an earlier one — `patchItem` on the
 * application the queued `create` hasn't inserted yet — and the server
 * answers a patch against a missing row with `return null`, which loses the
 * write in silence. So a head that has exhausted its attempts *blocks* the
 * queue instead of being stepped over; `retryFailed()` (on reconnect,
 * foreground or boot) is what unblocks it, and `SyncStatusBar` is what
 * makes the block visible while it lasts.
 */
export async function drainOutboxWith(
  outbox: Pick<StoreApi<OutboxState>, 'getState'>,
  runMutation: MutationRunner,
  schedule: Scheduler = defaultScheduler,
  // Unused until a later ticket adds per-op `onServerResponse`/`invalidates`
  // hooks that write the server's response into the React Query cache.
  _queryClient?: QueryClient,
): Promise<void> {
  if (draining) return
  draining = true
  try {
    for (;;) {
      const item = outbox.getState().items[0]
      if (!item || item.status === 'failed') return

      const op = getOp(item.type)
      if (!op) {
        // A persisted op from a build that no longer defines it. Retrying
        // can't help, and dropping it would delete a write the user made.
        outbox.getState().fail(item.id)
        return
      }

      try {
        await runMutation(op.send, item.args as Record<string, unknown>)
        outbox.getState().resolve(item.id)
      } catch {
        const attempts = item.attempts + 1
        if (attempts >= MAX_ATTEMPTS) {
          outbox.getState().fail(item.id)
        } else {
          outbox.getState().retry(item.id)
          schedule(
            () => void drainOutboxWith(outbox, runMutation, schedule, _queryClient),
            backoffMs(attempts),
          )
        }
        return
      }
    }
  } finally {
    draining = false
  }
}
