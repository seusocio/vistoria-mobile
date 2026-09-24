import { ActionSheetIOS, Alert, Platform } from 'react-native'
import type { HistorySortMode } from '@/features/application/shared/application.utils'

const SORT_OPTIONS: { mode: HistorySortMode; label: string }[] = [
  { mode: 'recent', label: 'Mais recentes' },
  { mode: 'alpha', label: 'Alfabética (A-Z)' },
  { mode: 'numeric', label: 'Numérica' },
]

/**
 * Cross-platform native picker, no bottom sheet: ActionSheetIOS on iOS,
 * which brings its own Cancel row, and Alert on Android, whose three-button
 * ceiling is exactly the three sort options - a Cancel button isn't needed
 * there since tapping outside the dialog already dismisses it.
 */
export function presentHistorySortPicker(onSelect: (mode: HistorySortMode) => void) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Ordenar histórico por tag',
        options: [...SORT_OPTIONS.map((option) => option.label), 'Cancelar'],
        cancelButtonIndex: SORT_OPTIONS.length,
      },
      (index) => {
        const selected = SORT_OPTIONS[index]
        if (selected) onSelect(selected.mode)
      },
    )
    return
  }

  Alert.alert(
    'Ordenar histórico por tag',
    undefined,
    SORT_OPTIONS.map((option) => ({
      text: option.label,
      onPress: () => onSelect(option.mode),
    })),
  )
}
