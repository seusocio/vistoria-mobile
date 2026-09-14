import { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { styles } from './styles'

export interface ScreenProps {
  children: ReactNode
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
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.blue.base} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
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
