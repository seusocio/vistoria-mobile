import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { colors } from '@/styles'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

export interface CircularProgressProps {
  /** 0-1 */
  progress: number
  size?: number
  strokeWidth?: number
  color?: string
  trackColor?: string
}

/** Linear-style ring: a thin track plus a colored arc for the completed fraction. */
export function CircularProgress({
  progress,
  size = 20,
  strokeWidth = 2.5,
  color = colors.blue.base,
  trackColor = colors.gray[200],
}: CircularProgressProps) {
  const clamped = Math.max(0, Math.min(1, progress))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const progressValue = useSharedValue(clamped)
  useEffect(() => {
    progressValue.value = withTiming(clamped, { duration: 260 })
  }, [clamped, progressValue])

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progressValue.value),
  }))

  return (
    // Rotated so the arc starts at 12 o'clock instead of Svg's default 3 o'clock.
    <View style={{ width: size, height: size, transform: [{ rotate: '-90deg' }] }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeLinecap="round"
          fill="none"
          animatedProps={animatedProps}
        />
      </Svg>
    </View>
  )
}
