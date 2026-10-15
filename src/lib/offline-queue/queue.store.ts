import AsyncStorage from '@react-native-async-storage/async-storage'
import { create, type StateCreator } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isRestEnabled } from '@/lib/backend-flags'
import { castConvex } from '@/lib/convex/cast'
import { generateId } from '@/lib/id'
import type { EntityKind, OpDefinition } from './ops'

export type QueuedOpStatus = 'pending' | 'failed'
export type OpBackend = 'convex' | 'rest'

/** Why the last send of an op didn't land — kept on the op so a blocked head can be diagnosed on-device. */
export interface OpError {
  message: string
  /** HTTP status for a REST failure; absent for a network/Convex error. */
  status?: number
  /** The server's error body, as parsed. */
  body?: unknown
  at: string
}

export interface QueuedOp {
  id: string
  type: string
  kind: EntityKind
  args: unknown
  entityId: string
  attempts: number
  enqueuedAt: string
  status: QueuedOpStatus
  /**
   * Which backend this op targets, decided once at enqueue time from the
   * entity's flag and carried with the op for its whole life in the queue.
   * A flag flip while a device is offline must not change what an
   * already-queued op sends — it targets whichever backend was live when the
   * user made the write.
   *
   * Optional for compat with ops persisted before this field existed, and
   * with tests that build a `QueuedOp` by hand — absent means `'convex'`,
   * the only backend that existed before it.
   */
  backend?: OpBackend
  lastError?: OpError
}

export interface OutboxState {
  items: QueuedOp[]
  enqueue: <Args, Entity>(op: OpDefinition<Args, Entity>, args: Args) => void
  /** The op landed on the server — drop it. */
  resolve: (id: string) => void
  /** Drops several ops at once — every op under a scope the server says is gone. */
  drop: (ids: string[]) => void
  /** The op failed but hasn't exhausted its attempts — keep it, bump the count. */
  retry: (id: string, error?: OpError) => void
  /** The op exhausted its attempts. Kept, not discarded, so no write is silently lost. */
  fail: (id: string, error?: OpError) => void
  /**
   * Gives every exhausted op a fresh budget. Called on the events that make a
   * previously hopeless op worth trying again — reconnect, foreground, boot —
   * because the usual reason an op burns its attempts is a network that has
   * since come back, not a write the server will reject forever.
   */
  retryFailed: () => void
}

/**
 * Re-targets ops persisted before this entity's REST cutover at the REST
 * backend, and strips the Convex system fields (`_id`/`_creationTime`) their
 * `entity` argument may still carry.
 *
 * `item.backend` is deliberately fixed at enqueue time so a flag flip can't
 * change what an in-flight op sends — but that rule has an end date. Once a
 * kind reads and writes REST only, an op still pointing at Convex can never
 * land: the whole-entity upserts (`checklists.save`) are rejected outright —
 * "ArgumentValidationError: Object contains extra field _creationTime" —
 * because those entities were read out of a Convex query before `castConvex`
 * existed, so they carry system fields the mutation validator doesn't declare. That error is not an `ApiError`, so the drain treats it as
 * retryable, burns `MAX_ATTEMPTS`, and the failed head then blocks *every*
 * REST write behind it — while `retryFailedOps` (reconnect, foreground,
 * boot) revives it and logs the same Convex failure again, forever.
 *
 * So: send it to REST instead, where the row exists under the same external
 * id (the data was moved by `scripts/migrate-convex-to-rest.ts`). Dropping
 * these items would be the one option that really loses a user's write.
 */
export function retargetLegacyConvexItems(items: QueuedOp[]): QueuedOp[] {
  return items.map((item) => {
    if (item.backend === 'rest' || !isRestEnabled(item.kind)) return item
    const args = item.args as { entity?: unknown } | null
    const entity =
      args && typeof args === 'object' && 'entity' in args ? castConvex(args.entity) : undefined
    return {
      ...item,
      backend: 'rest' as const,
      args: entity === undefined ? item.args : { ...args, entity },
      // A fresh budget: the attempts it burned were spent on a backend it
      // should never have been sent to.
      attempts: 0,
      status: 'pending' as const,
    }
  })
}

/**
 * Collapses repeated `setAttachmentUploadStatus` ops to the last one per
 * attachment. A feedback loop in an earlier build enqueued one per failed
 * upload attempt, thousands of them, each a request the server answers 404.
 */
export function compactOutbox(items: QueuedOp[]): QueuedOp[] {
  const lastIndex = new Map<string, number>()
  items.forEach((item, index) => {
    if (item.type === 'applications.setAttachmentUploadStatus') {
      lastIndex.set((item.args as { attachmentId: string }).attachmentId, index)
    }
  })
  return items.filter((item, index) =>
    item.type !== 'applications.setAttachmentUploadStatus'
      ? true
      : lastIndex.get((item.args as { attachmentId: string }).attachmentId) === index,
  )
}

export const createOutboxSlice: StateCreator<OutboxState> = (set) => ({
  items: [],
  enqueue: (op, args) =>
    set((state) => ({
      items: [
        ...state.items,
        {
          id: generateId('op_'),
          type: op.type,
          kind: op.kind,
          args,
          entityId: op.entityId(args),
          attempts: 0,
          enqueuedAt: new Date().toISOString(),
          status: 'pending',
          backend: isRestEnabled(op.kind) ? 'rest' : 'convex',
        },
      ],
    })),
  resolve: (id) =>
    set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
  drop: (ids) => {
    const dropped = new Set(ids)
    set((state) => ({ items: state.items.filter((item) => !dropped.has(item.id)) }))
  },
  retry: (id, error) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? { ...item, attempts: item.attempts + 1, ...(error ? { lastError: error } : {}) }
          : item,
      ),
    })),
  fail: (id, error) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, status: 'failed', ...(error ? { lastError: error } : {}) } : item,
      ),
    })),
  retryFailed: () =>
    set((state) =>
      state.items.some((item) => item.status === 'failed')
        ? {
            items: state.items.map((item) =>
              item.status === 'failed'
                ? { ...item, status: 'pending' as const, attempts: 0 }
                : item,
            ),
          }
        : state,
    ),
})

/**
 * The durable write queue: every pending mutation lives here, persisted to
 * AsyncStorage, until the server confirms it. This is the one thing in the
 * app that must survive a process kill for offline writes to survive one.
 *
 * The slice above is exported separately so tests can build a throwaway,
 * purely in-memory store — `create<OutboxState>()(createOutboxSlice)` —
 * without touching AsyncStorage: its web fallback reaches for `window`,
 * which doesn't exist outside a browser/RN runtime and turns every mutation
 * into a rejected promise under `bun test`.
 */
export const useOutbox = create<OutboxState>()(
  persist(createOutboxSlice, {
    name: '@vistoria/outbox',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (state) => ({ items: state.items }) as OutboxState,
    version: 1,
    onRehydrateStorage: () => (state) => {
      if (!state) return
      const compacted = compactOutbox(state.items)
      if (compacted.length !== state.items.length) useOutbox.setState({ items: compacted })
    },
    migrate: (persisted) => {
      const state = persisted as { items?: QueuedOp[] } | undefined
      return { items: retargetLegacyConvexItems(state?.items ?? []) } as OutboxState
    },
  }),
)
