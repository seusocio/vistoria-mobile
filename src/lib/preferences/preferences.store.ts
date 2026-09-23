import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { create, type StateCreator } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * How a checklist's histórico draws its group cards.
 *
 * - `detailed` — marker, subtitle, visit rows with outcome pills and an in-card
 *   action button. The default: it reads without being learned.
 * - `dense` — no marker, no subtitle, group actions as header icons, visits as
 *   tight rows with the negatives count as a number. Fits roughly twice as many
 *   visits on screen for someone who already knows the data.
 */
export type HistoryLayout = 'detailed' | 'dense'

export interface PreferencesState {
  historyLayout: HistoryLayout
  setHistoryLayout: (layout: HistoryLayout) => void
  toggleHistoryLayout: () => void
}

export const createPreferencesSlice: StateCreator<PreferencesState> = (set) => ({
  historyLayout: 'detailed',
  setHistoryLayout: (historyLayout) => set({ historyLayout }),
  toggleHistoryLayout: () =>
    set((state) => ({
      historyLayout: state.historyLayout === 'detailed' ? 'dense' : 'detailed',
    })),
})

/**
 * Display preferences the user sets once and expects to find again.
 *
 * Nothing here is data — losing the whole store costs a user one tap, which is
 * why it does not go near the offline queue. It is persisted because a display
 * choice that resets on every launch reads as a bug.
 *
 * The slice above is exported separately so tests can build a throwaway,
 * purely in-memory store — `create<PreferencesState>()(createPreferencesSlice)`
 * — without touching AsyncStorage, whose web fallback reaches for `window` and
 * turns every mutation into a rejected promise under `bun test`.
 */
export const usePreferences = create<PreferencesState>()(
  persist(createPreferencesSlice, {
    name: '@vistoria/preferences',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (state) =>
      ({ historyLayout: state.historyLayout }) as PreferencesState,
  }),
)

/**
 * True once AsyncStorage has been read.
 *
 * Hydration is async, so the first render always sees `detailed` regardless of
 * what was saved. Screens that would visibly flip should fold this into
 * whatever loading state they already show, rather than rendering the default
 * layout and swapping it a frame later.
 */
export function useHasHydratedPreferences(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    usePreferences.persist.hasHydrated(),
  )

  useEffect(() => {
    // Already done — a later screen mounting after the first read.
    if (usePreferences.persist.hasHydrated()) {
      setHydrated(true)
      return
    }
    return usePreferences.persist.onFinishHydration(() => setHydrated(true))
  }, [])

  return hydrated
}
