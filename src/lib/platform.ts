import { Platform } from 'react-native'

/**
 * iOS 26 shipped the liquid-glass tab bar, and the native navigator gets it
 * for free along with scroll-to-top on a second tap and automatic content
 * insets. There is nothing to improve there, so that version keeps the real
 * UITabBar.
 *
 * Below it the native bar is the flat pre-26 one, which sits under our pill
 * language rather than beside it - those builds get `FloatingTabBar`.
 *
 * Android keeps the native bar too: the request was iOS 25 and under. Drop the
 * `Platform.OS` check to bring Android along.
 */
export const usesFloatingTabBar =
  Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) < 26
