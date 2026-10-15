import type { QueryClient } from '@tanstack/react-query'
import type { StoreApi } from 'zustand'
import { ApiError } from '@/lib/api/fetcher'
import { logDrain, notifyScopeGone, toOpError } from './drain-log'
import { getOp, type OpDefinition } from './ops'
import type { OutboxState, QueuedOp } from './queue.store'
import { backoffMs, MAX_ATTEMPTS } from './retry-policy'

export type MutationRunner = (
  send: (args: Record<string, unknown>) => Promise<unknown>,
  args: Record<string, unknown>,
) => Promise<unknown>
export type Scheduler = (run: () => void, delayMs: number) => void

let draining = false

function scopeOf(op: OpDefinition<unknown, unknown>, item: QueuedOp): string {
  return op.scope ? op.scope(item.args) : item.entityId
}

/** The Visita an item belongs to, by the same rule the drain drops scopes with. */
export function scopeOfItem(item: QueuedOp): string {
  const op = getOp(item.type)
  return op ? scopeOf(op, item) : item.entityId
}

/**
 * Every queued op under `scopeId`, or null when one of them is that scope's
 * own `create` — then the scope isn't gone, it just hasn't been created yet,
 * and dropping its writes would lose them.
 */
function opsUnderScope(items: QueuedOp[], scopeId: string): QueuedOp[] | null {
  const matched: QueuedOp[] = []
  for (const item of items) {
    const op = getOp(item.type)
    if (!op || scopeOf(op, item) !== scopeId) continue
    if (item.type.endsWith('.create') && item.entityId === scopeId) return null
    matched.push(item)
  }
  return matched
}
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
        const error = toOpError(new Error(`op "${item.type}" is not defined in this build`))
        outbox.getState().fail(item.id, error)
        logDrain({ opId: item.id, type: item.type, outcome: 'unknown-op', error })
        return
      }

      // `item.backend` is fixed at enqueue time (see `queue.store.ts`), not
      // read from the live flag — so a flag flip while this op sat offline
      // can't strand it with a request shape the wrong backend expects.
      const isRest = item.backend === 'rest' && Boolean(op.sendRest)
      const send = isRest && op.sendRest ? op.sendRest : op.send

      let response: unknown
      try {
        response = await runMutation(send, item.args as Record<string, unknown>)
      } catch (caught) {
        const error = toOpError(caught)
        // A REST 4xx is never worth retrying: a 404 means this op's target
        // (still) doesn't exist on the server — most often a patch-style op
        // racing ahead of the `create` it depends on — and every other 4xx
        // is the server permanently rejecting what was sent. Either way,
        // burning attempts on a retry can't change the outcome; failing
        // immediately reuses the existing "failed head blocks the queue"
        // mechanism, so it stays visible and in place instead of resolving,
        // dropping, or being stepped over. Only 5xx/network errors retry
        // with backoff, same as before REST existed.
        const status = caught instanceof ApiError ? caught.status : undefined
        if (status !== undefined && status < 500) {
          if (op.bestEffort || (status === 404 && op.treatNotFoundAsDone)) {
            outbox.getState().resolve(item.id)
            const outcome = op.bestEffort ? 'dropped-best-effort' : 'resolved-not-found'
            logDrain({ opId: item.id, type: item.type, outcome, error })
            continue
          }
          const scopeId = op.isScopeGone?.(caught) ? scopeOf(op, item) : null
          const doomed = scopeId ? opsUnderScope(outbox.getState().items, scopeId) : null
          if (scopeId && doomed) {
            outbox.getState().drop(doomed.map((queued) => queued.id))
            for (const queued of doomed) {
              logDrain({ opId: queued.id, type: queued.type, outcome: 'dropped-scope-gone', error })
            }
            notifyScopeGone(scopeId)
            continue
          }
          outbox.getState().fail(item.id, error)
          logDrain({ opId: item.id, type: item.type, outcome: 'failed', error })
          return
        }

        const attempts = item.attempts + 1
        if (attempts >= MAX_ATTEMPTS) {
          outbox.getState().fail(item.id, error)
          logDrain({ opId: item.id, type: item.type, outcome: 'failed', error })
        } else {
          outbox.getState().retry(item.id, error)
          logDrain({ opId: item.id, type: item.type, outcome: 'retry', error })
          schedule(
            () => void drainOutboxWith(outbox, runMutation, schedule, queryClient),
            backoffMs(attempts),
          )
        }
        return
      }

      outbox.getState().resolve(item.id)
      logDrain({ opId: item.id, type: item.type, outcome: 'resolved' })
      // Only a REST response is shaped for the REST query cache — a
      // Convex mutation's return value has no relation to it, and writing
      // it in would leave a wrong-shaped entry waiting under the key this
      // entity's REST reads use once its flag flips.
      //
      // Outside the send's `try`: the op has landed, so a throw while patching
      // the cache must not be mistaken for a failed send — that stalled the
      // whole drain behind a backoff timer for an op already gone.
      if (queryClient && isRest) {
        try {
          op.onServerResponse?.(queryClient, item.args, response)
          for (const queryKey of op.invalidates?.(item.args) ?? []) {
            void queryClient.invalidateQueries({ queryKey })
          }
        } catch (caught) {
          logDrain({ opId: item.id, type: item.type, outcome: 'cache-error', error: toOpError(caught) })
        }
      }
    }
  } finally {
    draining = false
  }
}
