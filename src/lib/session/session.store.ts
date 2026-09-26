import AsyncStorage from '@react-native-async-storage/async-storage'
import { create, type StateCreator } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface SessionUser {
  id: string
  name?: string
  email?: string
}

export interface SessionState {
  token: string | null
  activeOrgId: string | null
  activeProjectId: string | null
  user: SessionUser | null
  setSession: (session: {
    token: string
    activeOrgId: string
    activeProjectId: string
    user: SessionUser
  }) => void
  clearSession: () => void
}

/**
 * Seeded from env so the app has a working org/project scope before the OTP
 * sign-in flow exists — that flow writes these same fields later, so nothing
 * downstream (every generated hook keys on `activeOrgId`/`activeProjectId`)
 * changes when auth lands.
 */
export const createSessionSlice: StateCreator<SessionState> = (set) => ({
  token: process.env.EXPO_PUBLIC_DEV_TOKEN || null,
  activeOrgId: process.env.EXPO_PUBLIC_DEV_ORG_ID || null,
  activeProjectId: process.env.EXPO_PUBLIC_DEV_PROJECT_ID || null,
  user: null,
  setSession: (session) => set(session),
  clearSession: () =>
    set({ token: null, activeOrgId: null, activeProjectId: null, user: null }),
})

/**
 * Non-React code (the fetcher, the drain) reads this via
 * `useSessionStore.getState()` directly, the same way the outbox already
 * does — there is no context to thread a session through a mutation runner
 * that lives outside React.
 */
export const useSessionStore = create<SessionState>()(
  persist(createSessionSlice, {
    name: '@vistoria/session',
    storage: createJSONStorage(() => AsyncStorage),
  }),
)
