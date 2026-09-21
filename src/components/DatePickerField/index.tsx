import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { BottomSheetView } from '@gorhom/bottom-sheet'
import { useState } from 'react'
import { Platform, Pressable, Text } from 'react-native'
import { colors } from '@/styles'
import { formatBrDateShort } from '@/utils/date'
import { AppBottomSheet } from '../AppBottomSheet'
import { Icon } from '../Icon'
import { useSheetFooterActions } from '../SheetFooterActions'
import { styles } from './styles'

export interface DatePickerFieldProps {
  /** ISO date string */
  value: string
  onChange: (iso: string) => void
  accessibilityLabel?: string
}

function toValidDate(value: string): Date {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

/** Opens the native calendar (Android) or a real stacked bottom sheet (iOS). */
export function DatePickerField({
  value,
  onChange,
  accessibilityLabel = 'Selecionar data da visita',
}: DatePickerFieldProps) {
  const date = toValidDate(value)
  const [visible, setVisible] = useState(false)
  const [draftDate, setDraftDate] = useState(date)

  function handlePickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'set' && selected) setDraftDate(selected)
  }

  function openPicker() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: date,
        mode: 'date',
        display: 'calendar',
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) onChange(selected.toISOString())
        },
      })
      return
    }

    setDraftDate(date)
    setVisible(true)
  }

  function closePicker() {
    setVisible(false)
  }

  function confirmPicker() {
    onChange(draftDate.toISOString())
    setVisible(false)
  }

  const footerComponent = useSheetFooterActions({
    confirmLabel: 'Aplicar',
    onConfirm: confirmPicker,
    cancelLabel: 'Cancelar',
    onCancel: closePicker,
  })

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Icon name="calendar" size={16} color={colors.gray[400]} />
        <Text style={styles.value}>{formatBrDateShort(date.toISOString())}</Text>
      </Pressable>

      <AppBottomSheet
        visible={visible}
        onClose={closePicker}
        footerComponent={footerComponent}
      >
        <BottomSheetView style={styles.sheetContent}>
          <Text style={styles.modalTitle}>Selecionar data</Text>
          <DateTimePicker
            value={draftDate}
            mode="date"
            display="inline"
            onChange={handlePickerChange}
            accentColor={colors.blue.base}
            themeVariant="light"
            style={styles.picker}
          />
        </BottomSheetView>
      </AppBottomSheet>
    </>
  )
}
