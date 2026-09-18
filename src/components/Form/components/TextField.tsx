import {
  Control,
  Controller,
  FieldPath,
  FieldValues,
} from 'react-hook-form'
import { Input } from '../../Input'
import type { InputProps } from '../../Input/types'
import { ErrorText } from './ErrorText'

export interface FormTextFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> extends Omit<InputProps, 'value' | 'onChangeValue'> {
  control: Control<TFieldValues>
  name: TName
}

/** Controller-wrapped `Input` — RHF owns the value, `Input` keeps its existing `onChangeValue` API. */
export function TextField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({ control, name, variant, ...props }: FormTextFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <>
          <Input
            {...props}
            variant={fieldState.error ? 'danger' : variant}
            value={field.value as string | number}
            onChangeValue={(value) => field.onChange(String(value))}
            onBlur={field.onBlur}
          />
          <ErrorText message={fieldState.error?.message} />
        </>
      )}
    />
  )
}
