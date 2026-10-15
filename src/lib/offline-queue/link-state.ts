import { create } from 'zustand'

/**
 * The device's link state, mirrored out of `useIsOnline` by
 * `useOutboxLifecycle` (mounted once at the root). The overlay reads this
 * rather than `useIsOnline` itself: `expo-network` transitively imports
 * `react-native` in a way `bun test` can't parse, and `overlay.test.ts`
 * reaches `overlay.ts` just by importing it.
 *
 * Starts offline, like `useIsOnline` before `expo-network` reports — the
 * overlay then settles on whatever it has cached instead of waiting.
 */
export const useLinkState = create<{ isOnline: boolean }>(() => ({ isOnline: false }))
