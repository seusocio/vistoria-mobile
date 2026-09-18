// Compound Form field adapters — thin react-hook-form `Controller` wrappers
// around the existing controlled inputs, so screens keep the same visuals and
// swap `useState` for `useForm`.

import { DateField } from './components/DateField'
import { ErrorText } from './components/ErrorText'
import { SheetTextField } from './components/SheetTextField'
import { TagSelect } from './components/TagSelect'
import { TextField } from './components/TextField'

export const Form = {
  TextField,
  SheetTextField,
  TagSelect,
  DateField,
  ErrorText,
}

export type { FormTextFieldProps } from './components/TextField'
export type { FormSheetTextFieldProps } from './components/SheetTextField'
export type { FormTagSelectProps } from './components/TagSelect'
export type { FormDateFieldProps } from './components/DateField'
export type { ErrorTextProps } from './components/ErrorText'
