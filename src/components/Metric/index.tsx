import { Text, View } from 'react-native'
import { colors } from '@/styles'
import { styles } from './styles'

export interface MetricProps {
  label: string
  value: string
  detail?: string
  /** overrides the value color, e.g. blue for item progress, green for application progress */
  valueColor?: string
}

/** Component/Metric */
export function Metric({ label, value, detail, valueColor }: MetricProps) {
  return (
    <View style={styles.container}>
      <Text style={[styles.value, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  )
}

export const metricValueColors = {
  blue: colors.blue.base,
  green: colors.success.base,
}
