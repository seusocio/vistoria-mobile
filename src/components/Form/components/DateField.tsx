import { Controller } from 'react-hook-form'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { DatePickerField } from '../../DatePickerField'
import type { DatePickerFieldProps } from '../../DatePickerField'

export interface FormDateFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> extends Omit<DatePickerFieldProps, 'value' | 'onChange'> {
  control: Control<TFieldValues>
  name: TName
}

/** Controller-wrapped `DatePickerField`. */
export function DateField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({ control, name, ...props }: FormDateFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <DatePickerField
          {...props}
          value={field.value as string}
          onChange={field.onChange}
        />
      )}
    />
  )
}
