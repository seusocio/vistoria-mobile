import { convexClient } from '@/infra/convex/client'
import { drainOutboxWith } from './drain'
import type { OpDefinition } from './ops'
import { useOutbox } from './queue.store'

/** Wires the pure drain algorithm (`drain.ts`) to the real outbox and the real Convex client. */
export function drainOutbox(): Promise<void> {
  return drainOutboxWith(useOutbox, (mutation, args) => convexClient.mutation(mutation, args as never))
}

/** The single write entrypoint: persist the op, then try to send it right away. */
export function enqueueOp<Args>(op: OpDefinition<Args, unknown>, args: Args): void {
  useOutbox.getState().enqueue(op, args)
  void drainOutbox()
}
