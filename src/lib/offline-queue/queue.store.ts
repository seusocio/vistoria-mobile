import AsyncStorage from '@react-native-async-storage/async-storage'
import { create, type StateCreator } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { generateId } from '@/infra/id'
import type { OpDefinition } from './ops'

export type QueuedOpStatus = 'pending' | 'failed'

export interface QueuedOp {
  id: string
  type: string
  args: unknown
  entityId: string
  attempts: number
  enqueuedAt: string
  status: QueuedOpStatus
}

export interface OutboxState {
  items: QueuedOp[]
  enqueue: <Args>(op: OpDefinition<Args, unknown>, args: Args) => void
  /** The op landed on the server — drop it. */
  resolve: (id: string) => void
  /** The op failed but hasn't exhausted its attempts — keep it, bump the count. */
  retry: (id: string) => void
  /** The op exhausted its attempts. Kept, not discarded, so no write is silently lost. */
  fail: (id: string) => void
}

/**
 * The store's logic with no persistence attached. Exported so tests can
 * build a throwaway, purely in-memory store — `create<OutboxState>()(createOutboxSlice)`
 * — without touching AsyncStorage: its web fallback reaches for `window`,
 * which doesn't exist outside a browser/RN runtime and turns every mutation
 * into a rejected promise under `bun test`. `useOutbox` below is the same
 * slice wrapped with `persist` for the app.
 */
export const createOutboxSlice: StateCreator<OutboxState> = (set) => ({
  items: [],
  enqueue: (op, args) =>
    set((state) => ({
      items: [
        ...state.items,
        {
          id: generateId('op_'),
          type: op.type,
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
})

/**
 * The durable write queue: every pending mutation lives here, persisted to
 * AsyncStorage, until the server confirms it. This is the one thing in the
 * app that must survive a process kill for offline writes to survive one.
 */
export const useOutbox = create<OutboxState>()(
  persist(createOutboxSlice, {
    name: '@vistoria/outbox',
    storage: createJSONStorage(() => AsyncStorage),
  }),
)
