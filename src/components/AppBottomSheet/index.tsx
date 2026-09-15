import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
  BottomSheetModal,
} from '@gorhom/bottom-sheet'
import { type ReactNode, useCallback, useEffect, useRef } from 'react'
import { Platform, StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { FullWindowOverlay } from 'react-native-screens'
import { styles } from './styles'
import { SheetContext } from './context'
import { SafeAreaView } from 'react-native-safe-area-context'

// iOS: render the sheet inside a native full-window overlay so it appears ABOVE
// the react-native-screens native stack/tab screens. Without this the sheet is
// mounted in the root JS view, which sits behind the native screens, so it never
// becomes visible. The overlay is a separate UIWindow, so it needs its own
// GestureHandlerRootView for the pan/backdrop gestures to work. Android renders
// in the provider portal correctly and needs no container override.
function IOSSheetContainer({ children }: { children?: ReactNode }) {
  return (
    <FullWindowOverlay>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        {children}
      </GestureHandlerRootView>
    </FullWindowOverlay>
  )
}

const CONTAINER_COMPONENT =
  Platform.OS === 'ios' ? IOSSheetContainer : undefined

export interface AppBottomSheetProps {
  visible: boolean
  onClose: () => void
  /** Allow pan-down and backdrop tap to close. Defaults to true. */
  dismissible?: boolean
  /** Explicit snap points; when omitted the sheet sizes to its content. */
  snapPoints?: Array<string | number>
  /** Caps content-sized sheets so long forms scroll instead of filling the screen. */
  maxDynamicContentSize?: number
  /** Optional footer rendered above the sheet's bottom edge while content scrolls. */
  footerComponent?: React.FC<BottomSheetFooterProps>
  children: ReactNode
}

/**
 * Controlled wrapper around `BottomSheetModal`. Presents/dismisses from the
 * `visible` prop and reports swipe/backdrop dismissals through `onClose`, so
 * screens keep their declarative state while the sheet is driven imperatively
 * under the hood (the idiomatic gorhom pattern).
 */
export function AppBottomSheet({
  visible,
  onClose,
  dismissible = true,
  snapPoints,
  maxDynamicContentSize = 680,
  footerComponent,
  children,
}: AppBottomSheetProps) {
  const sheetRef = useRef<BottomSheetModal>(null)
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  useEffect(() => {
    if (visible) sheetRef.current?.present()
  }, [visible])

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior={dismissible ? 'close' : 'none'}
      />
    ),
    [dismissible],
  )
  if (!visible) return null

  return (
    <BottomSheetModal
      ref={sheetRef}
      stackBehavior="push"
      snapPoints={snapPoints}
      enableDynamicSizing={snapPoints === undefined}
      maxDynamicContentSize={maxDynamicContentSize}
      footerComponent={footerComponent}
      enablePanDownToClose={dismissible}
      backdropComponent={renderBackdrop}
      containerComponent={CONTAINER_COMPONENT}
      handleIndicatorStyle={styles.handleIndicator}
      backgroundStyle={styles.background}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      enableBlurKeyboardOnGesture
      onDismiss={() => {
        if (visibleRef.current) onClose()
      }}
    >
      <SheetContext.Provider value={true}>
        <SafeAreaView>{children}</SafeAreaView>
      </SheetContext.Provider>
    </BottomSheetModal>
  )
}
