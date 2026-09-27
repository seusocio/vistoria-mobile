import type { QueryClient } from '@tanstack/react-query'
import type { StoreApi } from 'zustand'
import { ApiError } from '@/lib/api/fetcher'
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
  queryClient?: QueryClient,
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

      // `item.backend` is fixed at enqueue time (see `queue.store.ts`), not
      // read from the live flag — so a flag flip while this op sat offline
      // can't strand it with a request shape the wrong backend expects.
      const isRest = item.backend === 'rest' && Boolean(op.sendRest)
      const send = isRest && op.sendRest ? op.sendRest : op.send

      try {
        const response = await runMutation(send, item.args as Record<string, unknown>)
        outbox.getState().resolve(item.id)
        // Only a REST response is shaped for the REST query cache — a
        // Convex mutation's return value has no relation to it, and writing
        // it in would leave a wrong-shaped entry waiting under the key this
        // entity's REST reads use once its flag flips.
        if (queryClient && isRest) {
          op.onServerResponse?.(queryClient, item.args, response)
          for (const queryKey of op.invalidates?.(item.args) ?? []) {
            void queryClient.invalidateQueries({ queryKey })
          }
        }
      } catch (error) {
        // A REST 4xx is never worth retrying: a 404 means this op's target
        // (still) doesn't exist on the server — most often a patch-style op
        // racing ahead of the `create` it depends on — and every other 4xx
        // is the server permanently rejecting what was sent. Either way,
        // burning attempts on a retry can't change the outcome; failing
        // immediately reuses the existing "failed head blocks the queue"
        // mechanism, so it stays visible and in place instead of resolving,
        // dropping, or being stepped over. Only 5xx/network errors retry
        // with backoff, same as before REST existed.
        const status = error instanceof ApiError ? error.status : undefined
        if (status !== undefined && status < 500) {
          outbox.getState().fail(item.id)
          return
        }

        const attempts = item.attempts + 1
        if (attempts >= MAX_ATTEMPTS) {
          outbox.getState().fail(item.id)
        } else {
          outbox.getState().retry(item.id)
          schedule(
            () => void drainOutboxWith(outbox, runMutation, schedule, queryClient),
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
