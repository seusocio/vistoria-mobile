import { AnimatePresence, MotiView } from 'moti'
import { memo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors } from '@/styles'
import { BadgeTone } from '../Badge'
import { Icon } from '../Icon'
import { VisitRow } from './VisitRow'
import { styles } from './styles'

export interface ApplicationRowEntry {
  id: string
  dateLabel: string
  negativeCount: number
}

export interface ApplicationRowProps {
  tagLabels: string[]
  latestStatusLabel: string
  latestStatusTone: BadgeTone
  entries: ApplicationRowEntry[]
  onOpenEntry: (id: string) => void
  onRepeat: () => void
  onEditTags?: () => void
  defaultExpanded?: boolean
}

/** Component/ApplicationRow */
export const ApplicationRow = memo(function ApplicationRow({
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
  const latest = entries[0]
  const previous = entries.slice(1).reverse()
  const highlightRepeat = latest ? latest.negativeCount > 0 : false

  const visitsLabel = `${entries.length} ${entries.length === 1 ? 'vistoria' : 'vistorias'}`
  const tagsTitle =
    tagLabels.length > 0 ? tagLabels.join('  ·  ') : 'Sem tags associadas'

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.7 }]}
        onPress={() => setExpanded((prev) => !prev)}
        accessibilityRole="button"
      >
        <View style={styles.marker}>
          {/* <Icon name="tag" size={16} color={colors.blue.base} /> */}
        </View>

        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {tagsTitle}
          </Text>
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
        </View>

        <Icon
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.gray[400]}
        />
      </Pressable>

      <AnimatePresence>
        {expanded && (
          <MotiView
            from={{ opacity: 0, translateY: -8 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: -8 }}
            transition={{ type: 'timing', duration: 180 }}
            style={styles.body}
          >
            <View style={styles.divider} />
            {onEditTags ? (
              <Pressable
                style={({ pressed }) => [
                  styles.editTagsButton,
                  pressed && { opacity: 0.7 },
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
                <View style={styles.historyList}>
                  {previous.map((entry) => (
                    <VisitRow
                      key={entry.id}
                      entry={entry}
                      onPress={() => onOpenEntry(entry.id)}
                    />
                  ))}
                </View>
              </>
            )}

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
          </MotiView>
        )}
      </AnimatePresence>
    </View>
  )
})
