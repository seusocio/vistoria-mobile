import * as Haptics from 'expo-haptics'

/**
 * Thin wrapper over expo-haptics. Use sparingly — haptic on everything becomes
 * noise and users turn it off (mobile-ux Padrão 9). Never on scroll, plain
 * navigation, or every keystroke.
 *
 * Failures are swallowed: haptics is feedback, never a reason to break a flow
 * (e.g. simulators / unsupported devices reject the call).
 */
export const haptics = {
  /** Selecting an option in a sheet, toggling an answer. */
  selection() {
    void Haptics.selectionAsync().catch(() => {})
  },
  /** A task/application was completed. */
  success() {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => {})
  },
  /** A validation error was surfaced to the user. */
  error() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
      () => {},
    )
  },
  /** A long press started reordering an item. */
  dragStart() {
    if (typeof Haptics.impactAsync !== 'function') return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  },
  /** The camera shutter fired. */
  impact() {
    if (typeof Haptics.impactAsync !== 'function') return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
  },
}
