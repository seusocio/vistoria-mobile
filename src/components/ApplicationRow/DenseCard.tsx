import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors } from '@/styles'
import { Collapsible } from '../Collapsible'
import { Icon } from '../Icon'
import { denseStyles as styles } from './dense.styles'
import { sharedStyles } from './styles'
import type { ApplicationRowProps } from './types'

/**
 * The `dense` history layout: no marker, no subtitle, the group's two actions
 * as icon buttons in the header itself, and visits as tight rows with the
 * negatives count as a right-aligned number instead of a pill.
 *
 * Roughly twice as many visits per screen. The trade is discoverability - a
 * 15pt icon is a much smaller target than a labelled button - so this is opt-in
 * and never the default.
 */
export function DenseCard({
  tagLabels,
  entries,
  onOpenEntry,
  onRepeat,
  onEditTags,
  defaultExpanded = false,
}: ApplicationRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const handleToggle = useCallback(() => setExpanded((prev) => !prev), [])

  const tagsTitle =
    tagLabels.length > 0 ? tagLabels.join('  ·  ') : 'Sem tags associadas'

  return (
    <View style={sharedStyles.container}>
      <Collapsible.Root
        expanded={expanded}
        onToggle={handleToggle}
        variant="card"
      >
        <Collapsible.Header title={tagsTitle}>
          {/* Nested pressables: the header toggles the section, these don't. */}
          {onEditTags ? (
            <Pressable
              hitSlop={10}
              onPress={onEditTags}
              accessibilityLabel="Editar tags do grupo"
            >
              <Icon name="edit-pen" size={15} color={colors.gray[400]} />
            </Pressable>
          ) : null}
          <Pressable
            hitSlop={10}
            onPress={onRepeat}
            accessibilityLabel="Nova aplicação neste grupo"
          >
            <Icon name="repeat" size={15} color={colors.blue.base} />
          </Pressable>
          <Collapsible.HeaderCount>{entries.length}</Collapsible.HeaderCount>
        </Collapsible.Header>

        <Collapsible.Content>
          <View>
            {entries.map((entry) => (
              <Pressable
                key={entry.id}
                style={({ pressed }) => [
                  styles.row,
                  pressed && sharedStyles.rowPressed,
                ]}
                onPress={() => onOpenEntry(entry.id)}
              >
                <View
                  style={[
                    styles.tick,
                    entry.negativeCount > 0
                      ? styles.tickWarning
                      : styles.tickSuccess,
                    entry.status === 'draft' && styles.tickDraft,
                  ]}
                />
                <Text style={styles.rowDate}>{entry.dateLabel}</Text>
                {entry.status === 'draft' ? (
                  <Text style={styles.rowDraft}>rascunho</Text>
                ) : null}
                <Text
                  style={
                    entry.negativeCount > 0 ? styles.countWarn : styles.countOk
                  }
                >
                  {entry.negativeCount > 0 ? entry.negativeCount : '—'}
                </Text>
              </Pressable>
            ))}
          </View>
        </Collapsible.Content>
      </Collapsible.Root>
    </View>
  )
}
