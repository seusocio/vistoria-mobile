import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'

export const TOP_BAR = 52
export const BANNER_EXTRA = 56
export const OVERLAP = 24

/**
 * Twitter-style header: everything is driven by one scroll offset on the UI
 * thread. The in-page name and the tabs report where they sit (`nameY`,
 * `tabsY`) from their own `onLayout`.
 */
export function useCollapsingHeader() {
  const insets = useSafeAreaInsets()
  const barHeight = insets.top + TOP_BAR
  const bannerHeight = barHeight + BANNER_EXTRA
  const scrollY = useSharedValue(0)
  const tabsY = useSharedValue(Number.MAX_SAFE_INTEGER)
  const nameY = useSharedValue(Number.MAX_SAFE_INTEGER)
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y
  })
  // Pull-down: grow the banner from its top edge so the bounce never reveals the
  // white scroll background. Scroll-up: slight parallax under the white sheet.
  const bannerStyle = useAnimatedStyle(() => {
    const y = scrollY.value
    if (y < 0) return { transform: [{ translateY: y }], height: bannerHeight - y }
    return { transform: [{ translateY: y * 0.5 }], height: bannerHeight }
  })
  // Bar stays transparent over the banner and turns solid once the banner is gone.
  const barBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [bannerHeight - barHeight - OVERLAP - 1, bannerHeight - barHeight - OVERLAP],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }))
  // Name fades into the bar once the in-page name has scrolled under it.
  const barNameStyle = useAnimatedStyle(() => {
    const start = nameY.value - barHeight
    return {
      opacity: interpolate(scrollY.value, [start, start + 24], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(scrollY.value, [start, start + 24], [8, 0], Extrapolation.CLAMP),
        },
      ],
    }
  })
  const avatarStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(scrollY.value, [0, 60], [1, 0.72], Extrapolation.CLAMP),
      },
    ],
  }))
  // Manual sticky: pins the tabs right under the top bar (stickyHeaderIndices can only pin at y=0).
  const tabsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(0, scrollY.value - (tabsY.value - barHeight)) }],
  }))

  return {
    topInset: insets.top,
    barHeight,
    bannerHeight,
    onScroll,
    nameY,
    tabsY,
    bannerStyle,
    barBgStyle,
    barNameStyle,
    avatarStyle,
    tabsStyle,
  }
}

export type CollapsingHeader = ReturnType<typeof useCollapsingHeader>
