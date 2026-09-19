import type { NavigationAction, NavigationProp, ParamListBase } from '@react-navigation/native'
import { usePreventRemove } from '@react-navigation/native'
import { useRef, useState } from 'react'

export interface UnsavedChangesGuard {
  visible: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Intercepts navigating away from a dirty form and asks for confirmation.
 * Render the returned state into a `ConfirmBottomSheet` in the screen.
 *
 * Uses `usePreventRemove` rather than a plain `beforeRemove` listener: on
 * native-stack the iOS swipe-back and the Android hardware back are handled by
 * the platform, and `preventDefault` on a JS listener never sees them - the
 * screen just pops and the edits are gone. This hook registers the route as
 * prevented, so the navigator blocks the native dismissal and re-dispatches the
 * pop through JS, where the confirmation can actually happen.
 *
 * Must be called from a screen component (it reads the current route).
 */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  navigation: NavigationProp<ParamListBase>,
): UnsavedChangesGuard {
  const [visible, setVisible] = useState(false)
  const pendingAction = useRef<NavigationAction | null>(null)

  usePreventRemove(isDirty, ({ data }) => {
    pendingAction.current = data.action
    setVisible(true)
  })

  function onCancel() {
    pendingAction.current = null
    setVisible(false)
  }

  function onConfirm() {
    setVisible(false)
    // Dispatching the very action we were handed is what lets it through: it
    // carries the set of routes that already answered, so the guard skips it
    // the second time instead of re-opening the sheet forever.
    if (pendingAction.current) navigation.dispatch(pendingAction.current)
  }

  return { visible, onCancel, onConfirm }
}
