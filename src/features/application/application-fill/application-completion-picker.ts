import { ActionSheetIOS, Alert, Platform } from 'react-native'

const OPTIONS = [
  { action: 'draft', label: 'Salvar rascunho' },
  { action: 'complete', label: 'Concluir aplicação' },
] as const

export type ApplicationCompletionAction = (typeof OPTIONS)[number]['action']

/**
 * Cross-platform native picker for the fill screen's primary button, no
 * bottom sheet: ActionSheetIOS on iOS, which brings its own Cancel row and
 * respects the app's (light-only) interface style, and Alert on Android,
 * whose three-button ceiling covers the two actions plus Cancel.
 */
export function presentApplicationCompletionPicker(
  onSelect: (action: ApplicationCompletionAction) => void,
) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Concluir aplicação',
        options: [...OPTIONS.map((option) => option.label), 'Cancelar'],
        cancelButtonIndex: OPTIONS.length,
        userInterfaceStyle: 'light',
      },
      (index) => {
        const selected = OPTIONS[index]
        if (selected) onSelect(selected.action)
      },
    )
    return
  }

  Alert.alert(
    'Concluir aplicação',
    undefined,
    [
      ...OPTIONS.map((option) => ({
        text: option.label,
        onPress: () => onSelect(option.action),
      })),
      { text: 'Cancelar', style: 'cancel' as const },
    ],
  )
}
