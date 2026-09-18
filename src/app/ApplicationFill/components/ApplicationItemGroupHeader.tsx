import { MotiView } from 'moti'
import { Pressable, StyleSheet, Text } from 'react-native'
import { CircularProgress } from '@/components/CircularProgress'
import { Icon } from '@/components/Icon'
import { colors, textStyles } from '@/styles'
import { haptics } from '@/utils/haptics'

interface ApplicationItemGroupHeaderProps {
  title: string
  answered: number
  total: number
  expanded: boolean
  onToggle: () => void
  /** Fills every item in the group when it isn't fully done yet, clears them all when it is. */
  onToggleAll: () => void
}

/** Flat, full-bleed accordion header for one section (room/area) of checklist items. */
export function ApplicationItemGroupHeader({
  title,
  answered,
  total,
  expanded,
  onToggle,
  onToggleAll,
}: ApplicationItemGroupHeaderProps) {
  const complete = total > 0 && answered === total

  return (
    <Pressable
      style={styles.container}
      onPress={onToggle}
      accessibilityLabel={`${expanded ? 'Recolher' : 'Expandir'} ${title}`}
      accessibilityRole="button"
    >
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Pressable
        hitSlop={10}
        onPress={() => {
          haptics.selection()
          onToggleAll()
        }}
        accessibilityRole="button"
        accessibilityLabel={complete ? `Desmarcar ${title}` : `Concluir ${title}`}
      >
        <CircularProgress
          progress={total > 0 ? answered / total : 0}
          color={complete ? colors.success.base : colors.blue.base}
        />
      </Pressable>
      <Text style={[styles.count, complete && styles.countComplete]}>
        {answered}/{total}
      </Text>
      <MotiView
        animate={{ rotate: expanded ? '90deg' : '0deg' }}
        transition={{ type: 'timing', duration: 180 }}
      >
        <Icon name="chevron-right" size={14} color={colors.gray[400]} />
      </MotiView>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  title: {
    ...textStyles.cardTitle,
    flex: 1,
  },
  count: {
    ...textStyles.metaLabel,
  },
  countComplete: {
    color: colors.success.base,
  },
})
