import AsyncStorage from '@react-native-async-storage/async-storage'
import { create, type StateCreator } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { generateId } from '@/lib/id'
import type { EntityKind, OpDefinition } from './ops'

export type QueuedOpStatus = 'pending' | 'failed'

export interface QueuedOp {
  id: string
  type: string
  kind: EntityKind
  args: unknown
  entityId: string
  attempts: number
  enqueuedAt: string
  status: QueuedOpStatus
}

export interface OutboxState {
  items: QueuedOp[]
  enqueue: <Args, Entity>(op: OpDefinition<Args, Entity>, args: Args) => void
  /** The op landed on the server — drop it. */
  resolve: (id: string) => void
  /** The op failed but hasn't exhausted its attempts — keep it, bump the count. */
  retry: (id: string) => void
  /** The op exhausted its attempts. Kept, not discarded, so no write is silently lost. */
  fail: (id: string) => void
  /**
   * Gives every exhausted op a fresh budget. Called on the events that make a
   * previously hopeless op worth trying again — reconnect, foreground, boot —
   * because the usual reason an op burns its attempts is a network that has
   * since come back, not a write the server will reject forever.
   */
  retryFailed: () => void
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
  retry: (id) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, attempts: item.attempts + 1 } : item,
      ),
    })),
  fail: (id) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, status: 'failed' } : item,
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
  }),
)
