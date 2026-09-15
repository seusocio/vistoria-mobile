import { createContext } from 'react'

/**
 * True for any subtree rendered inside an `AppBottomSheet`. Text inputs read
 * this to decide between `BottomSheetTextInput` (required inside a sheet so the
 * lib can coordinate focus/keyboard/pan) and a plain `TextInput` outside one.
 *
 * Kept in its own module so leaf components (`SheetAwareTextInput`, `Input`)
 * can consume it without importing the heavy `AppBottomSheet` component.
 */
export const SheetContext = createContext(false)
