import { Controller } from 'react-hook-form'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { TagMultiSelect } from '../../TagMultiSelect'
import type { TagMultiSelectProps } from '../../TagMultiSelect'

export interface FormTagSelectProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> extends Omit<TagMultiSelectProps, 'selectedIds' | 'onChange'> {
  control: Control<TFieldValues>
  name: TName
}

/** Controller-wrapped `TagMultiSelect`. */
export function TagSelect<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({ control, name, ...props }: FormTagSelectProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <TagMultiSelect
          {...props}
          selectedIds={field.value as string[]}
          onChange={field.onChange}
        />
      )}
    />
  )
}
