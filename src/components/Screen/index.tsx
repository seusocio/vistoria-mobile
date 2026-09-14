import { MotiView } from 'moti'
import { ReactNode } from 'react'
import {
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { styles } from './styles'

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

        {loading ? (
          <ScreenSkeleton />
        ) : content ? (
          content
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior="automatic"
            automaticallyAdjustKeyboardInsets
          >
            {children}
          </ScrollView>
        )}

        {footer ? (
          <View style={[styles.footer, { paddingBottom: bottom + 16 }]}>
            {footer}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  )
}
