import { create } from 'zustand'
import type { Application } from '@/infra/domain/entities'
import { api } from '../../../convex/_generated/api'
import { convexClient } from '../convex/client'

/** A tap the server hasn't confirmed yet. */
interface PendingAnswer {
  answer: string
  updatedAt: string
}

type PendingByItem = Record<string, PendingAnswer>

interface LocalAnswersState {
  pending: Record<string, PendingByItem>
  error: Record<string, string | null>
  setAnswer: (applicationId: string, itemId: string, answer: string) => void
  flush: (applicationId: string) => Promise<void>
  /** Drops entries whose value the server has caught up with. */
  reconcile: (applicationId: string, application: Application) => void
}

/** How long to batch taps before syncing, so rapid toggles never hit the network per-tap. */
const FLUSH_DEBOUNCE_MS = 1500
/** Backoff before re-trying a batch that failed to reach the server. */
const RETRY_DELAY_MS = 5000

const flushTimers: Record<string, ReturnType<typeof setTimeout>> = {}
const inFlight: Record<string, true> = {}

function scheduleFlush(applicationId: string, delay: number) {
  clearTimeout(flushTimers[applicationId])
  flushTimers[applicationId] = setTimeout(() => {
    void useLocalAnswersStore.getState().flush(applicationId)
  }, delay)
}

export const useLocalAnswersStore = create<LocalAnswersState>((set, get) => ({
  pending: {},
  error: {},
  setAnswer: (applicationId, itemId, answer) => {
    set((state) => ({
      pending: {
        ...state.pending,
        [applicationId]: {
          ...state.pending[applicationId],
          [itemId]: { answer, updatedAt: new Date().toISOString() },
        },
      },
      error: { ...state.error, [applicationId]: null },
    }))
    scheduleFlush(applicationId, FLUSH_DEBOUNCE_MS)
  },
  flush: async (applicationId) => {
    clearTimeout(flushTimers[applicationId])
    delete flushTimers[applicationId]
    if (inFlight[applicationId]) {
      // Re-arm rather than drop it: this timer lives outside React, so a flush
      // triggered while leaving the screen still lands after the unmount.
      scheduleFlush(applicationId, FLUSH_DEBOUNCE_MS)
      return
    }
    const pending = get().pending[applicationId]
    if (!pending || Object.keys(pending).length === 0) return

    // Entries stay in `pending` (and so stay rendered) until `reconcile` sees
    // the server agree. Clearing them here would drop the overlay before the
    // reactive query catches up, flashing the pre-tap answers back on screen.
    inFlight[applicationId] = true
    try {
      await convexClient.mutation(api.applications.patchItems, {
        applicationId,
        patches: Object.entries(pending).map(([itemId, entry]) => ({
          itemId,
          patch: { answer: entry.answer, suggested: false, suggestionSource: null },
        })),
        updatedAt: new Date().toISOString(),
      })
      set((state) => ({ error: { ...state.error, [applicationId]: null } }))
    } catch {
      set((state) => ({
        error: {
          ...state.error,
          [applicationId]: 'Não foi possível salvar as respostas. Tentando de novo...',
        },
      }))
      scheduleFlush(applicationId, RETRY_DELAY_MS)
    } finally {
      delete inFlight[applicationId]
    }
  },
  reconcile: (applicationId, application) => {
    const pending = get().pending[applicationId]
    if (!pending) return
    const confirmed = application.items.filter(
      (item) => pending[item.id] && pending[item.id].answer === item.answer,
    )
    if (confirmed.length === 0) return
    set((state) => {
      const current = state.pending[applicationId]
      if (!current) return state
      const next = { ...current }
      for (const item of confirmed) {
        // A tap landing after the server value was read stays pending.
        if (next[item.id]?.answer === item.answer) delete next[item.id]
      }
      if (Object.keys(next).length === 0) {
        const { [applicationId]: _empty, ...rest } = state.pending
        return { ...state, pending: rest }
      }
      return { ...state, pending: { ...state.pending, [applicationId]: next } }
    })
  },
}))

/**
 * Overlays not-yet-confirmed answers onto the reactive Convex application so a
 * tap renders instantly. Single pass, and items without a pending answer keep
 * their identity so memoized rows below don't re-render.
 */
export function applyPendingAnswers(
  application: Application,
  pending: PendingByItem | undefined,
): Application {
  if (!pending || Object.keys(pending).length === 0) return application
  return {
    ...application,
    items: application.items.map((item) => {
      const entry = pending[item.id]
      if (!entry || entry.answer === item.answer) return item
      return {
        ...item,
        answer: entry.answer,
        answeredAt: entry.answer ? entry.updatedAt : null,
        suggested: false,
        suggestionSource: null,
        updatedAt: entry.updatedAt,
      }
    }),
  }
}
