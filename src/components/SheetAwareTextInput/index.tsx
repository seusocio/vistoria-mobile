import { BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { forwardRef, useContext } from 'react'
import { TextInput, type TextInputProps } from 'react-native'
import { SheetContext } from '../AppBottomSheet/context'

/**
 * TextInput that renders `BottomSheetTextInput` when mounted inside an
 * `AppBottomSheet` and a plain `TextInput` otherwise.
 *
 * Why: inside a bottom sheet a raw `TextInput` doesn't coordinate with the
 * sheet's pan gesture and keyboard handling, so the field ends up hidden behind
 * the keyboard or the sheet stops responding to drags. The lib's
 * `BottomSheetTextInput` wires that up — but it must NOT be used outside a
 * sheet (it reads sheet-internal context). This component picks the right one
 * automatically, so shared inputs work in both places. (mobile-ux Padrão 3)
 */
export const SheetAwareTextInput = forwardRef<TextInput, TextInputProps>(
  function SheetAwareTextInput(props, ref) {
    const inSheet = useContext(SheetContext)
    if (inSheet) {
      // BottomSheetTextInput forwards to a TextInput under the hood.
      return <BottomSheetTextInput ref={ref as never} {...props} />
    }
    return <TextInput ref={ref} {...props} />
  },
)
