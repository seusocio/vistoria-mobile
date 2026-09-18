import { Controller } from 'react-hook-form'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import type { TextInputProps } from 'react-native'
import { SheetAwareTextInput } from '../../SheetAwareTextInput'

export interface FormSheetTextFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  control: Control<TFieldValues>
  name: TName
}

/**
 * Controller-wrapped `SheetAwareTextInput` — keeps working inside a bottom sheet
 * (drawer/sheet drafts) and as a plain inline `TextInput` outside one.
 */
export function SheetTextField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({ control, name, ...props }: FormSheetTextFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <SheetAwareTextInput
          {...props}
          value={field.value as string}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  )
}
