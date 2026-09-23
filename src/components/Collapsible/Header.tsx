import { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { COLLAPSIBLE_DURATION_MS } from './constants'
import { useCollapsible } from './context'
import { styles } from './styles'

export interface CollapsibleHeaderProps {
  title: string
  /** A second line under the title. Given as a node because its emphasis is the screen's (a status tone, a count) - the stacking is ours. */
  subtitle?: ReactNode
  /** A leading accessory before the title (an avatar, a marker), laid out before it. */
  leading?: ReactNode
  /** Trailing accessories (a count, a progress ring), laid out before the chevron. */
  children?: ReactNode
}

/**
 * The accordion's press target and its whole visual identity - every screen
 * gets the same bar, and adds only its own accessories as slots.
 */
export function CollapsibleHeader({
  title,
  subtitle,
  leading,
  children,
}: CollapsibleHeaderProps) {
  const { expanded, toggle, variant } = useCollapsible()

  // `expanded` is a plain prop, so this worklet is re-evaluated only when the
  // section is actually toggled - unlike a shared value that changes on every
  // layout pass, which would restart the animation from wherever it happened
  // to be.
  const chevronStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          rotate: withTiming(expanded ? '90deg' : '0deg', {
            duration: COLLAPSIBLE_DURATION_MS,
          }),
        },
      ],
    }),
    [expanded],
  )

  const titleStyle = [
    styles.headerTitle,
    variant === 'card' && styles.headerTitleCard,
  ]

  return (
    <Pressable
      style={() => [styles.header, variant === 'card' && styles.headerCard]}
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={`${expanded ? 'Recolher' : 'Expandir'} ${title}`}
    >
      {leading}
      {subtitle ? (
        // The column takes the slack instead of the title: `flex: 1` on a Text
        // inside a column stretches it vertically rather than filling the bar.
        <View style={styles.headerTextCol}>
          <Text style={titleStyle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle}
        </View>
      ) : (
        <Text style={[titleStyle, styles.headerTitleFill]} numberOfLines={1}>
          {title}
        </Text>
      )}
      {children}
      <Animated.View style={chevronStyle}>
        <Icon name="chevron-right" size={14} color={colors.gray[400]} />
      </Animated.View>
    </Pressable>
  )
}

export interface CollapsibleHeaderCountProps {
  children: ReactNode
  /** Turns the count green once whatever it counts is fully done. */
  complete?: boolean
}

/** The count slot of a header ("12", "3/8") in the shared meta style. */
export function CollapsibleHeaderCount({
  children,
  complete = false,
}: CollapsibleHeaderCountProps) {
  return (
    <Text style={[styles.headerCount, complete && styles.headerCountSuccess]}>
      {children}
    </Text>
  )
}
