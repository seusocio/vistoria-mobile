import { Pressable, Text } from 'react-native'
import { Icon } from '@/components/Icon'
import type { HistoryLayout } from '@/lib/preferences'
import { colors } from '@/styles'
import { styles } from '../checklist-detail.styles'

const LABELS: Record<HistoryLayout, string> = {
  detailed: 'Detalhado',
  dense: 'Denso',
}

interface HistoryLayoutToggleProps {
  layout: HistoryLayout
  onToggle: () => void
}

/**
 * Flips the histórico between its two layouts and shows which one is on.
 *
 * Labelled with the *current* layout, not the one a tap would switch to: a
 * toggle that names its destination reads as a statement about the present
 * every time, and the user has to remember which convention this one picked.
 */
export function HistoryLayoutToggle({
  layout,
  onToggle,
}: HistoryLayoutToggleProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.layoutToggle, pressed && { opacity: 0.6 }]}
      onPress={onToggle}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Exibição do histórico: ${LABELS[layout]}. Tocar para alternar.`}
    >
      <Icon name="repeat" size={12} color={colors.gray[600]} />
      <Text style={styles.layoutToggleText}>{LABELS[layout]}</Text>
    </Pressable>
  )
}
