import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { Platform, Pressable, Text, View } from 'react-native'
import { colors } from '@/styles'
import { formatBrDateShort } from '@/utils/date'
import { Icon } from '../Icon'
import { styles } from './styles'

export interface DatePickerFieldProps {
  /** ISO date string */
  value: string
  onChange: (iso: string) => void
}

function toValidDate(value: string): Date {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

/** Native date field using @react-native-community/datetimepicker. */
export function DatePickerField({ value, onChange }: DatePickerFieldProps) {
  const date = toValidDate(value)

  function commit(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'set' && selected) onChange(selected.toISOString())
  }

  // iOS: the compact picker is a self-contained tappable field that opens the
  // calendar in a native popover above everything, so it never overflows inside
  // the edit modal the way an inline calendar did.
  if (Platform.OS === 'ios') {
    return (
      <View style={styles.iosRow}>
        <Icon name="calendar" size={16} color={colors.gray[400]} />
        <DateTimePicker
          value={date}
          mode="date"
          display="compact"
          onChange={commit}
          accentColor={colors.blue.base}
          themeVariant="light"
        />
      </View>
    )
  }

  // Android: open the native dialog imperatively on tap.
  return (
    <Pressable
      style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.7 }]}
      onPress={() =>
        DateTimePickerAndroid.open({
          value: date,
          mode: 'date',
          onChange: commit,
        })
      }
      accessibilityRole="button"
      accessibilityLabel="Selecionar data da visita"
    >
      <Icon name="calendar" size={16} color={colors.gray[400]} />
      <Text style={styles.value}>{formatBrDateShort(value)}</Text>
    </Pressable>
  )
}
