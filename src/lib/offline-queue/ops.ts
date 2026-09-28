import type { QueryClient, QueryKey } from '@tanstack/react-query'

/**
 * Which table an op writes to. The overlay uses it to keep ops from bleeding
 * across entity types: a pending `checklists.save` and a pending
 * `applications.create` both look like "an entity the server doesn't have
 * yet", and without a kind the checklist gets injected into the list of
 * applications.
 */
export type EntityKind = 'application' | 'checklist' | 'tag'

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
  kind: EntityKind
  /** Sends the op to Convex. Every op still defines this — it's what runs while the entity's REST flag is off, and what a REST-cut op falls back to if `sendRest` is missing. */
  send: (args: Args) => Promise<unknown>
  /**
   * Sends the op to the Vistoria REST API instead. Present once this op's
   * entity has cut Seam A. The drain picks between this and `send` per queued
   * item, using the backend that item captured at enqueue time — never the
   * flag's current value — so a flip landing mid-flight can't strand a queued
   * op with the wrong request shape.
   */
  sendRest?: (args: Args) => Promise<unknown>
  applyLocal: (entity: Entity | null, args: Args) => Entity | null
  /** Which entity this op's pending state is grouped under, for the overlay. */
  entityId: (args: Args) => string
  /**
   * Writes the server's applied response into the React Query cache once the
   * op resolves, before the outbox drops it and the overlay stops covering
   * for it — closing the gap between "op left the queue" and "the read hook
   * has fresh data" that would otherwise flicker the screen back to the
   * pre-write value for one frame.
   */
  onServerResponse?: (queryClient: QueryClient, args: Args, response: unknown) => void
  /** Query keys to invalidate once the op resolves — e.g. a list's derived counts. */
  invalidates?: (args: Args) => QueryKey[]
}

const registry = new Map<string, OpDefinition<unknown, unknown>>()

/**
 * Registers an op under a globally unique `type`. Call this once per op, at
 * module scope in a `*.ops.ts` file — the outbox looks ops up by `type` when
 * it drains, so every `*.ops.ts` module that can appear in a persisted queue
 * must be imported eagerly at app boot (`src/features/ops.ts` does exactly
 * that, and is imported by `App.tsx`). Relying on a screen's own import to
 * register its ops only works while every route is statically imported: a
 * pending op from a previous session would otherwise outlive the code that
 * knows how to replay it.
 */
export function defineOp<Args, Entity>(
  type: string,
  config: Omit<OpDefinition<Args, Entity>, 'type'>,
): OpDefinition<Args, Entity> {
  // `registry` is a module-scope singleton Fast Refresh doesn't reset, but
  // Fast Refresh *does* re-execute a `*.ops.ts` module whenever something it
  // transitively imports changes — so a duplicate registration in dev is a
  // routine reload, not a bug, and should replace the old definition rather
  // than crash the module (and everything that imports `checklistSave` etc.
  // from it) on every unrelated edit elsewhere in the app. In production,
  // where nothing hot-reloads, the same duplicate can only mean a real
  // `type` collision between two ops — that should still throw.
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__
  if (registry.has(type) && !isDev) {
    throw new Error(`offline-queue: op "${type}" is already defined`)
  }
  const op: OpDefinition<Args, Entity> = { type, ...config }
  registry.set(type, op as OpDefinition<unknown, unknown>)
  return op
}

/**
 * Returns `undefined` for a type nobody registered rather than throwing.
 * The overlay runs this during render, and a persisted op from an older
 * build — one whose op was renamed or removed — must not take the screen
 * down with it. The drain treats the same case as a permanent failure, so
 * it stays visible instead of silently disappearing.
 */
export function getOp(type: string): OpDefinition<unknown, unknown> | undefined {
  return registry.get(type)
}
