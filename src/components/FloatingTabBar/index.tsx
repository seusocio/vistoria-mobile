import {
  BottomTabBarHeightCallbackContext,
  BottomTabBarHeightContext,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs'
import { useContext } from 'react'
import { type LayoutChangeEvent, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/styles'
import { Icon, type IconName } from '../Icon'
import { styles } from './styles'

export interface FloatingTabBarPrimaryAction {
  /** Defaults to a plus - this is the "add something" slot. */
  icon?: IconName
  /** Not drawn; the circle is icon-only, so this is what a screen reader says. */
  label: string
  onPress: () => void
}

export interface FloatingTabBarProps extends BottomTabBarProps {
  /**
   * The circle riding beside the pill. It is deliberately not a tab: it pushes
   * a screen onto the parent stack instead of switching sections, and the
   * native bar could only fake that with a placeholder screen.
   */
  primaryAction?: FloatingTabBarPrimaryAction
}

/**
 * The app's sections, as a pill floating over the screen background instead of
 * a bar pinned to its edge - the same shape language as `FloatingAction`.
 *
 * It is pinned over the scene rather than laid out under it, so the list runs
 * beneath the pill instead of stopping at a white strip. What it covers is
 * published through the navigator's own height context - see
 * `useFloatingTabBarClearance`, which is how screens pad their last row clear
 * of it without hardcoding this file's measurements.
 *
 * Only reachable below iOS 26 - see `usesFloatingTabBar`.
 */
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
  primaryAction,
}: FloatingTabBarProps) {
  const insets = useSafeAreaInsets()
  const reportHeight = useContext(BottomTabBarHeightCallbackContext)

  const onLayout = (event: LayoutChangeEvent) => {
    reportHeight?.(event.nativeEvent.layout.height)
  }

  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}
      pointerEvents="box-none"
      onLayout={onLayout}
    >
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]
          const focused = state.index === index
          const tint = focused ? colors.blue.base : colors.gray[400]
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name)

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params)
            }
          }

          return (
            <Pressable
              key={route.key}
              style={({ pressed }) => [
                styles.tab,
                focused && styles.tabFocused,
                pressed && styles.pressed,
              ]}
              onPress={onPress}
              onLongPress={() =>
                navigation.emit({ type: 'tabLongPress', target: route.key })
              }
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            >
              {options.tabBarIcon?.({ focused, color: tint, size: 20 })}
              <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {primaryAction ? (
        <Pressable
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          onPress={primaryAction.onPress}
          accessibilityRole="button"
          accessibilityLabel={primaryAction.label}
        >
          <Icon
            name={primaryAction.icon ?? 'plus'}
            size={24}
            color={colors.white}
          />
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * How much of a tab screen's bottom the floating bar covers, for lists that
 * need their last row scrollable clear of it.
 *
 * 0 everywhere the bar isn't: stack screens, and iOS 26's native bar, which
 * insets its own scroll views.
 */
export function useFloatingTabBarClearance() {
  return useContext(BottomTabBarHeightContext) ?? 0
}
