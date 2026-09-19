import type { FunctionReference } from 'convex/server'

/**
 * One declared write. `applyLocal` is the single place that decides what an
 * op does to an entity — it doubles as the optimistic overlay (`overlay.ts`)
 * and, for ops that build a brand-new entity, the local stand-in for a
 * `create` the server hasn't seen yet (`entity` is `null` in that case).
 * It must mirror the Convex handler's merge rules exactly, or the screen
 * shows something different from what the server ends up computing.
 *
 * That includes the not-found case: every Convex mutation handler in this
 * app guards `if (!entity) return null` before touching its fields, because
 * the entity a patch targets can genuinely not exist yet on the server (a
 * `create` still in flight, a slow reconnect) — this is not a corrupt state,
 * it's an ordinary moment in an offline-first app. A patch-style
 * `applyLocal` must return the same `null` right back for that case instead
 * of casting `entity as Entity` and touching its fields — that cast doesn't
 * change what's in memory, it just turns a normal condition into a crash a
 * few lines later.
 */
export interface OpDefinition<Args, Entity> {
  type: string
  mutation: FunctionReference<'mutation'>
  applyLocal: (entity: Entity | null, args: Args) => Entity | null
  /** Which entity this op's pending state is grouped under, for the overlay. */
  entityId: (args: Args) => string
}

const registry = new Map<string, OpDefinition<unknown, unknown>>()

/**
 * Registers an op under a globally unique `type`. Call this once per op, at
 * module scope in a `*.ops.ts` file — the outbox looks ops up by `type` when
 * it drains, so every `*.ops.ts` module that can appear in a persisted queue
 * must be imported eagerly at app boot (not lazily, only when its screen
 * mounts), otherwise a pending op from a previous session can outlive the
 * code that knows how to replay it.
 */
export function defineOp<Args, Entity>(
  type: string,
  config: Omit<OpDefinition<Args, Entity>, 'type'>,
): OpDefinition<Args, Entity> {
  if (registry.has(type)) {
    throw new Error(`offline-queue: op "${type}" is already defined`)
  }
  const op: OpDefinition<Args, Entity> = { type, ...config }
  registry.set(type, op as OpDefinition<unknown, unknown>)
  return op
}

export function getOp(type: string): OpDefinition<unknown, unknown> {
  const op = registry.get(type)
  if (!op) {
    throw new Error(
      `offline-queue: unknown op "${type}" — its *.ops.ts module was not imported before the outbox drained`,
    )
  }
  return op
}
