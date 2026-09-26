import { queryClient } from '@/lib/query-client'
import { drainOutboxWith } from './drain'
import type { OpDefinition } from './ops'
import { useOutbox } from './queue.store'

/** Wires the pure drain algorithm (`drain.ts`) to the real outbox and each op's own `send`. */
export function drainOutbox(): Promise<void> {
  return drainOutboxWith(useOutbox, (send, args) => send(args), undefined, queryClient)
}

/**
 * Gives exhausted ops a fresh budget and drains again. The head of the queue
 * blocks everything behind it once it fails, so this is what turns "the
 * network came back" into "the queue moves again".
 */
export function retryFailedOps(): Promise<void> {
  useOutbox.getState().retryFailed()
  return drainOutbox()
}

/** The single write entrypoint: persist the op, then try to send it right away. */
export function enqueueOp<Args, Entity>(op: OpDefinition<Args, Entity>, args: Args): void {
  useOutbox.getState().enqueue(op, args)
  void drainOutbox()
}
