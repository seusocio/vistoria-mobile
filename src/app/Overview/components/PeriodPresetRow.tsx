import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { styles } from '../styles'

export type PeriodPreset = 'all' | 'today' | 'week' | 'month' | 'custom'

export const PRESET_LABEL: Record<PeriodPreset, string> = {
  all: 'Tudo',
  today: 'Hoje',
  week: 'Últimos 7 dias',
  month: 'Este mês',
  custom: 'Personalizado',
}

interface PeriodPresetRowProps {
  value: PeriodPreset
  onChange: (value: PeriodPreset) => void
}

export const PeriodPresetRow = memo(function PeriodPresetRow({
  value,
  onChange,
}: PeriodPresetRowProps) {
  return (
    <View style={styles.presetRow}>
      {(Object.keys(PRESET_LABEL) as PeriodPreset[]).map((key) => (
        <Pressable
          key={key}
          style={({ pressed }) => [
            styles.presetChip,
            value === key && styles.presetChipActive,
            pressed && styles.pressed,
          ]}
          onPress={() => onChange(key)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === key }}
        >
          <Text
            style={[
              styles.presetChipText,
              value === key && styles.presetChipTextActive,
            ]}
          >
            {PRESET_LABEL[key]}
          </Text>
        </Pressable>
      ))}
    </View>
  )
})
