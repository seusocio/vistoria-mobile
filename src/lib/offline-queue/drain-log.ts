import { create } from 'zustand'
import { ApiError } from '@/lib/api/fetcher'
import type { OpError } from './queue.store'

export type DrainOutcome =
  | 'resolved'
  | 'resolved-not-found'
  | 'dropped-best-effort'
  | 'retry'
  | 'failed'
  | 'unknown-op'
  /** The op landed, but writing its response into the query cache threw. */
  | 'cache-error'
  /** Dropped because the server says its Visita no longer exists. */
  | 'dropped-scope-gone'

export interface DrainEvent {
  at: string
  opId: string
  type: string
  outcome: DrainOutcome
  error?: OpError
}

const MAX_EVENTS = 200

interface DrainLogState {
  events: DrainEvent[]
  clear: () => void
}

/**
 * What the drain did, newest first — in memory only, for the on-device outbox
 * debugger. A resolved op leaves the queue, so without this there is no trace
 * of the writes that *did* go through (or were waved off as 404) before the
 * one that's stuck.
 */
export const useDrainLog = create<DrainLogState>()((set) => ({
  events: [],
  clear: () => set({ events: [] }),
}))

export function logDrain(event: Omit<DrainEvent, 'at'>) {
  useDrainLog.setState((state) => ({
    events: [{ ...event, at: new Date().toISOString() }, ...state.events].slice(0, MAX_EVENTS),
  }))
}

export function toOpError(error: unknown): OpError {
  const at = new Date().toISOString()
  if (error instanceof ApiError) return { message: error.message, status: error.status, body: error.body, at }
  if (error instanceof Error) return { message: error.message, at }
  return { message: String(error), at }
}

const scopeGoneListeners = new Set<(scopeId: string) => void>()

/**
 * Called after the drain drops a whole scope (see `OpDefinition.isScopeGone`).
 * The upload queue listens here: a job for a deleted Visita can only 404 and
 * "heal" its row back through the outbox, forever.
 */
export function onScopeGone(listener: (scopeId: string) => void): () => void {
  scopeGoneListeners.add(listener)
  return () => scopeGoneListeners.delete(listener)
}

export function notifyScopeGone(scopeId: string) {
  for (const listener of scopeGoneListeners) listener(scopeId)
}
