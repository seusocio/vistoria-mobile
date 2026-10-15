import AsyncStorage from '@react-native-async-storage/async-storage'
import { create, type StateCreator } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { generateId } from '@/lib/id'
import type { EntityKind, OpDefinition } from './ops'

export type QueuedOpStatus = 'pending' | 'failed'

/** Why the last send of an op didn't land — kept on the op so a blocked head can be diagnosed on-device. */
export interface OpError {
  message: string
  /** HTTP status for a server failure; absent for a network error. */
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

/** A queued op as persisted by a build from before the Convex backend was removed. */
export type PersistedOp = QueuedOp & { backend?: 'convex' | 'rest' }

function stripConvexSystemFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripConvexSystemFields)
  if (value === null || typeof value !== 'object') return value
  const { _id, _creationTime, ...rest } = value as Record<string, unknown>
  return rest
}

/**
 * Brings ops persisted while the app still had a Convex backend in line with
 * the REST-only drain: drops the `backend` tag they carried, and strips the
 * Convex system fields (`_id`/`_creationTime`) an `entity` read from a Convex
 * query may still hold — whole-entity upserts (`checklists.save`) would
 * otherwise send them along.
 *
 * Dropping these ops instead would be the one option that really loses a
 * user's write: their rows exist on the REST side under the same external id
 * (the data was moved by `scripts/migrate-convex-to-rest.ts`). An op that was
 * stuck on Convex gets a fresh budget, since the attempts it burned were spent
 * on a backend it will never be sent to again.
 */
export function migrateLegacyConvexItems(items: PersistedOp[]): QueuedOp[] {
  return items.map(({ backend, ...item }) => {
    if (backend === 'rest') return item
    const args = item.args as { entity?: unknown } | null
    const entity =
      args && typeof args === 'object' && 'entity' in args ? stripConvexSystemFields(args.entity) : undefined
    return {
      ...item,
      args: entity === undefined ? item.args : { ...args, entity },
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
    // 2: the `backend` tag is gone — see `migrateLegacyConvexItems`.
    version: 2,
    onRehydrateStorage: () => (state) => {
      if (!state) return
      const compacted = compactOutbox(state.items)
      if (compacted.length !== state.items.length) useOutbox.setState({ items: compacted })
    },
    migrate: (persisted) => {
      const state = persisted as { items?: PersistedOp[] } | undefined
      return { items: migrateLegacyConvexItems(state?.items ?? []) } as OutboxState
    },
  }),
)
