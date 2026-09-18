import type { NavigationAction, NavigationProp, ParamListBase } from '@react-navigation/native'
import { useEffect, useRef, useState } from 'react'

export interface UnsavedChangesGuard {
  visible: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Intercepts navigating away from a dirty form and asks for confirmation.
 * Render the returned state into a `ConfirmBottomSheet` in the screen.
 */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  navigation: NavigationProp<ParamListBase>,
): UnsavedChangesGuard {
  const [visible, setVisible] = useState(false)
  const pendingAction = useRef<NavigationAction | null>(null)

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!isDirty) return
        e.preventDefault()
        pendingAction.current = e.data.action
        setVisible(true)
      }),
    [isDirty, navigation],
  )

  function onCancel() {
    pendingAction.current = null
    setVisible(false)
  }

  function onConfirm() {
    setVisible(false)
    if (pendingAction.current) navigation.dispatch(pendingAction.current)
  }

  return { visible, onCancel, onConfirm }
}
