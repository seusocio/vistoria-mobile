import { MotiView } from 'moti'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Icon } from '@/components/Icon'
import { ProgressBar } from '@/components/ProgressBar'
import { colors, textStyles } from '@/styles'

interface ApplicationItemGroupHeaderProps {
  title: string
  answered: number
  total: number
  expanded: boolean
  onToggle: () => void
}

/** TickTick-style accordion header for one section (room/area) of checklist items. */
export function ApplicationItemGroupHeader({
  title,
  answered,
  total,
  expanded,
  onToggle,
}: ApplicationItemGroupHeaderProps) {
  const complete = total > 0 && answered === total

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && { opacity: 0.7 }]}
      onPress={onToggle}
      accessibilityLabel={`${expanded ? 'Recolher' : 'Expandir'} ${title}`}
      accessibilityRole="button"
    >
      <MotiView
        animate={{ rotate: expanded ? '90deg' : '0deg' }}
        transition={{ type: 'timing', duration: 180 }}
      >
        <Icon name="chevron-right" size={14} color={colors.gray[400]} />
      </MotiView>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          <Text style={[styles.count, complete && styles.countComplete]}>
            {answered}/{total}
          </Text>
        </View>
        <ProgressBar progress={total > 0 ? answered / total : 0} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: 12,
  },
  content: {
    flex: 1,
    gap: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...textStyles.cardTitle,
  },
  count: {
    ...textStyles.metaLabel,
  },
  countComplete: {
    color: colors.blue.base,
  },
})
