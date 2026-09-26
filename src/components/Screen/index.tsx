import { MotiView } from 'moti'
import { ReactNode, ComponentType } from 'react'
import {
  Pressable,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIsOnline } from '@/lib/offline-queue'
import { colors } from '@/styles'
import { FLOATING_ACTION_CLEARANCE } from '../FloatingAction'
import { useFloatingTabBarClearance } from '../FloatingTabBar'
import { Icon } from '../Icon'
import { CONTENT_PADDING_BOTTOM, styles } from './styles'

function SkeletonBlock({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <MotiView
      accessibilityElementsHidden
      from={{ opacity: 0.45 }}
      animate={{ opacity: 0.9 }}
      transition={{ type: 'timing', duration: 700, loop: true }}
      style={[styles.skeletonBlock, style]}
    />
  )
}

function ScreenSkeleton() {
  return (
    <View style={styles.loading} accessibilityLabel="Carregando">
      <View style={styles.skeletonIntro}>
        <SkeletonBlock style={styles.skeletonTitle} />
        <SkeletonBlock style={styles.skeletonSubtitle} />
      </View>
      <SkeletonBlock style={styles.skeletonFeature} />
      <View style={styles.skeletonList}>
        {[0, 1, 2, 3, 4].map((item) => (
          <View key={item} style={styles.skeletonCard}>
            <SkeletonBlock style={styles.skeletonIcon} />
            <View style={styles.skeletonCardBody}>
              <SkeletonBlock style={styles.skeletonCardTitle} />
              <SkeletonBlock style={styles.skeletonCardSubtitle} />
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

export interface ScreenProps {
  children?: ReactNode
  /** Optional virtualized content that replaces the default ScrollView. */
  content?: ReactNode
  /** Replaces the default ScrollView, e.g. ScrollViewContainer for nested reorderable lists */
  ScrollComponent?: ComponentType<ScrollViewProps>
  loading?: boolean
  /** top = Screen/Biblioteca & Screen/Overview big title; nested = back button + small nav title */
  variant?: 'top' | 'nested'
  title?: string
  subtitle?: string
  navTitleTone?: 'muted' | 'strong'
  onBack?: () => void
  headerRight?: ReactNode
  headerExtra?: ReactNode
  /** Fixed action bar rendered below the scroll area, e.g. a form's save button */
  footer?: ReactNode
}

export function Screen({
  children,
  content,
  ScrollComponent = ScrollView,
  loading = false,
  variant = 'top',
  title,
  subtitle,
  navTitleTone = 'muted',
  onBack,
  headerRight,
  headerExtra,
  footer,
}: ScreenProps) {
  const { bottom } = useSafeAreaInsets()
  const tabBarClearance = useFloatingTabBarClearance()
  const isOnline = useIsOnline()
  const connectionLabel = !isOnline
    ? 'Sem conexão · alterações serão reenviadas'
    : null

  // Whatever floats over the scroll area has to be scrollable past: a footer
  // pill, the tab bar, or both stacked when a tab screen has an action of its
  // own. Only the default ScrollView gets this - a screen bringing its own
  // list applies `useFloatingTabBarClearance` itself.
  const contentPaddingBottom =
    (footer ? FLOATING_ACTION_CLEARANCE : CONTENT_PADDING_BOTTOM) +
    tabBarClearance

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screen}>
        {variant === 'top' ? (
          <View style={styles.topHeader}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        ) : (
          <View style={styles.navRow}>
            <View style={styles.navLeft}>
              {onBack && (
                <Pressable
                  style={({ pressed }) => [
                    styles.backButton,
                    pressed && { opacity: 0.7 },
                  ]}
                  hitSlop={10}
                  onPress={onBack}
                  accessibilityLabel="Voltar"
                >
                  <Icon name="chevron-left" size={18} color={colors.ink.base} />
                </Pressable>
              )}
              {title ? (
                <Text
                  style={
                    navTitleTone === 'strong'
                      ? styles.navTitleStrong
                      : styles.navTitleMuted
                  }
                  numberOfLines={1}
                >
                  {title}
                </Text>
              ) : null}
            </View>
            {headerRight}
          </View>
        )}

        {headerExtra}
        {connectionLabel ? (
          <View style={styles.connectionPill} accessible>
            <Text style={styles.connectionText}>{connectionLabel}</Text>
          </View>
        ) : null}

        {loading ? (
          <ScreenSkeleton />
        ) : content ? (
          content
        ) : (
          <ScrollComponent
            contentContainerStyle={[
              styles.content,
              { paddingBottom: contentPaddingBottom },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior="automatic"
            automaticallyAdjustKeyboardInsets
          >
            {children}
          </ScrollComponent>
        )}

        {footer ? (
          // box-none: the bar spans the screen width but only the pill inside
          // it should catch touches - everything around it belongs to the list
          // scrolling underneath.
          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(bottom, tabBarClearance) },
            ]}
            pointerEvents="box-none"
          >
            {footer}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  )
}
