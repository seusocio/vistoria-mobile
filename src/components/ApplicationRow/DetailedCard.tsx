import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors } from '@/styles'
import { Collapsible } from '../Collapsible'
import { Icon } from '../Icon'
import type { ApplicationRowProps } from './types'
import { VisitRow } from './VisitRow'
import { sharedStyles, styles } from './styles'

/**
 * The `detailed` history layout: marker, subtitle, outcome pills, and the
 * group's action as a button inside the card. Reads without being learned,
 * which is why it is the default.
 *
 * The open/close is Collapsible in its `card` variant: same bar layout, same
 * chevron, same timing as the accordion sections on the form and fill screens,
 * with the card itself supplying the shell. Only the card and what goes inside
 * it are this component's own design.
 */
export function DetailedCard({
  tagLabels,
  latestStatusLabel,
  latestStatusTone,
  entries,
  onOpenEntry,
  onRepeat,
  onEditTags,
  defaultExpanded = false,
}: ApplicationRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const handleToggle = useCallback(() => setExpanded((prev) => !prev), [])
  const latest = entries[0]
  const previous = entries.slice(1).reverse()
  const highlightRepeat = latest ? latest.negativeCount > 0 : false

  const visitsLabel = `${entries.length} ${entries.length === 1 ? 'vistoria' : 'vistorias'}`
  const tagsTitle =
    tagLabels.length > 0 ? tagLabels.join('  ·  ') : 'Sem tags associadas'

  return (
    <View style={sharedStyles.container}>
      <Collapsible.Root
        expanded={expanded}
        onToggle={handleToggle}
        variant="card"
      >
        <Collapsible.Header
          title={tagsTitle}
          leading={
            <View style={styles.marker}>
              <Icon name="tag" size={16} color={colors.blue.base} />
            </View>
          }
          subtitle={
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {visitsLabel}
              {'  •  '}
              <Text
                style={
                  latestStatusTone === 'completed'
                    ? styles.headerStatusCompleted
                    : styles.headerStatusDraft
                }
              >
                {latestStatusLabel}
              </Text>
            </Text>
          }
        />

        <Collapsible.Content>
          {/* No wrapper padding or gap: every child runs to the card's edges
              and carries its own hairline, so the divider under the bar and
              the rules between rows are the same 1px line repeated. */}
          <View>
            <View style={styles.divider} />
            {onEditTags ? (
              <Pressable
                style={({ pressed }) => [
                  styles.editTagsRow,
                  pressed && sharedStyles.rowPressed,
                ]}
                onPress={onEditTags}
                accessibilityLabel="Editar tags das aplicações"
              >
                <Icon name="edit-pen" size={14} color={colors.blue.base} />
                <Text style={styles.editTagsText}>Editar tags do grupo</Text>
              </Pressable>
            ) : null}

            {previous.length > 0 && (
              <>
                <Text style={styles.historyLabel}>Vistorias anteriores</Text>
                {previous.map((entry) => (
                  <VisitRow
                    key={entry.id}
                    entry={entry}
                    divided
                    onPress={() => onOpenEntry(entry.id)}
                  />
                ))}
              </>
            )}

            {/* Last, undivided: the button's whitespace closes the card, so a
                rule here would be a third line in the same corner. */}
            {latest ? (
              <VisitRow
                entry={latest}
                strong
                onPress={() => onOpenEntry(latest.id)}
              />
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.repeatButton,
                highlightRepeat && styles.repeatButtonHighlight,
                pressed && { opacity: 0.7 },
              ]}
              onPress={onRepeat}
              accessibilityLabel="Nova aplicação"
            >
              <Text style={styles.repeatButtonText}>Nova aplicação</Text>
              <Icon name="repeat" size={16} color={colors.white} />
            </Pressable>
          </View>
        </Collapsible.Content>
      </Collapsible.Root>
    </View>
  )
}
