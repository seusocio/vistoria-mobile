import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { useState } from 'react'
import { Modal, Platform, Pressable, Text, View } from 'react-native'
import { colors } from '@/styles'
import { formatBrDateShort } from '@/utils/date'
import { Icon } from '../Icon'
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

/** Opens the native calendar in a modal layer above screens and sheets. */
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

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Icon name="calendar" size={16} color={colors.gray[400]} />
        <Text style={styles.value}>{formatBrDateShort(value)}</Text>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={closePicker}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar data</Text>
              <Pressable
                hitSlop={12}
                onPress={closePicker}
                accessibilityRole="button"
                accessibilityLabel="Cancelar seleção de data"
              >
                <Icon name="multiply" size={20} color={colors.gray[600]} />
              </Pressable>
            </View>

            <DateTimePicker
              value={draftDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={handlePickerChange}
              accentColor={colors.blue.base}
              themeVariant="light"
              style={styles.picker}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelButton}
                onPress={closePicker}
                accessibilityRole="button"
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={styles.confirmButton}
                onPress={confirmPicker}
                accessibilityRole="button"
              >
                <Text style={styles.confirmButtonText}>Aplicar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}
