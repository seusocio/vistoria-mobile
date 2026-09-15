import { AnimatePresence, MotiView } from 'moti'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/styles'
import { radius, space, touch } from '@/styles/tokens'

const UNDO_WINDOW = 5000

export interface UndoAction {
  message: string
  /** Runs when the window expires or the toast is replaced: do the real work. */
  onCommit?: () => void
  /** Runs when the user taps "Desfazer": put things back. */
  onUndo: () => void
}

interface UndoToastContextValue {
  show: (action: UndoAction) => void
}

const UndoToastContext = createContext<UndoToastContextValue | null>(null)

export function useUndoToast(): UndoToastContextValue {
  const ctx = useContext(UndoToastContext)
  if (!ctx) {
    throw new Error('useUndoToast precisa estar dentro de <UndoToastProvider>')
  }
  return ctx
}

/**
 * Optimistic-undo snackbar (mobile-ux Padrão 6). For reversible actions the
 * caller removes the item from the UI immediately, then calls `show` with the
 * real persistence in `onCommit` and the restore in `onUndo`. The network work
 * only fires when the ~5s window expires, so "Desfazer" is just cancelling a
 * timer — no round-trip. One toast at a time; showing a second commits the
 * first (never drops work silently).
 */
export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<UndoAction | null>(null)
  const pendingRef = useRef<UndoAction | null>(null)
  const timer = useRef<number | null>(null)
  const insets = useSafeAreaInsets()

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  pendingRef.current = pending

  useEffect(() => {
    return () => {
      clearTimer()
      pendingRef.current?.onCommit?.()
    }
  }, [clearTimer])

  const show = useCallback(
    (action: UndoAction) => {
      if (pendingRef.current) {
        clearTimer()
        pendingRef.current.onCommit?.()
      }
      setPending(action)
      timer.current = setTimeout(() => {
        action.onCommit?.()
        timer.current = null
        setPending(null)
      }, UNDO_WINDOW)
    },
    [clearTimer],
  )

  const undo = useCallback(() => {
    clearTimer()
    pendingRef.current?.onUndo()
    setPending(null)
  }, [clearTimer])

  return (
    <UndoToastContext.Provider value={{ show }}>
      {children}
      <AnimatePresence>
        {pending ? (
          <MotiView
            key="undo-toast"
            from={{ opacity: 0, translateY: 24 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: 24 }}
            transition={{ type: 'timing', duration: 220 }}
            accessibilityLiveRegion="polite"
            pointerEvents="box-none"
          >
            <Text style={styles.message} numberOfLines={1}>
              {pending.message}
            </Text>
            <Pressable
              onPress={undo}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Desfazer"
            >
              <Text style={styles.undo}>Desfazer</Text>
            </Pressable>
          </MotiView>
        ) : null}
      </AnimatePresence>
    </UndoToastContext.Provider>
  )
}

const styles = StyleSheet.create({
  snackbar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    minHeight: touch.min,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.ink.base,
  },
  message: {
    flex: 1,
    color: colors.white,
    fontSize: 15,
  },
  undo: {
    color: '#7CA8FF',
    fontSize: 15,
    fontWeight: '700',
  },
})
