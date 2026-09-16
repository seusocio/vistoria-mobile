import { memo, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import { ResponseOption } from '@/infra/domain/entities'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { AnswerToggleRow } from './AnswerToggleRow'
import { styles } from './styles'

export interface ItemCardProps {
  title: string
  tagLabel?: string
  hasNote: boolean
  photosCount: number
  quantity: number | null
  suggested: boolean
  suggestionSource?: 'transcript' | 'previous_application' | null
  options: ResponseOption[]
  answer: string
  onAnswerChange: (answer: string) => void
  onOpenDrawer: () => void
  onAcceptSuggestion?: () => void
  onRejectSuggestion?: () => void
  /** Optional drag handle icon rendered inside the card, left of the title */
  dragHandle?: ReactNode
  /** Long-pressing anywhere on the card starts dragging it */
  onDragStart?: () => void
}

/** Component/ItemCard */
export const ItemCard = memo(function ItemCard({
  title,
  tagLabel,
  hasNote,
  photosCount,
  quantity,
  suggested,
  suggestionSource,
  options,
  answer,
  onAnswerChange,
  onOpenDrawer,
  onAcceptSuggestion,
  onRejectSuggestion,
  dragHandle,
  onDragStart,
}: ItemCardProps) {
  const suggestionEnabled = FEATURE_FLAG.suggestion && suggested
  const transcriptSuggestion =
    suggestionEnabled && suggestionSource === 'transcript'

  return (
    <View
      style={[
        styles.itemShell,
        transcriptSuggestion && styles.itemShellTranscriptSuggestion,
      ]}
    >
      <Pressable
        style={[
          styles.container,
          suggestionEnabled && styles.containerSuggested,
          transcriptSuggestion && styles.containerTranscriptSuggestion,
        ]}
        onPress={onOpenDrawer}
        onLongPress={onDragStart}
        delayLongPress={520}
        accessibilityLabel={`Editar detalhes de ${title}`}
      >
        {dragHandle}
        <View style={styles.titleCol}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <View style={styles.metaRow}>
            {tagLabel ? (
              <View style={styles.metaItem}>
                <Icon name="tag" size={10} color={colors.gray[400]} />
                <Text style={styles.metaText}>{tagLabel}</Text>
              </View>
            ) : null}
            {hasNote && (
              <View style={styles.metaItem}>
                <Icon
                  name="note-with-text"
                  size={10}
                  color={colors.gray[400]}
                />
              </View>
            )}
            {photosCount > 0 && (
              <View style={styles.metaItem}>
                <Icon name="camera" size={10} color={colors.gray[400]} />
                <Text style={styles.metaText}>{photosCount}</Text>
              </View>
            )}
            {quantity !== null && (
              <View style={styles.metaItem}>
                <Text style={styles.metaText}>Qtd {quantity}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.answerToggles}>
          {options.map((option) => (
            <AnswerToggleRow
              key={option.label}
              option={option}
              selected={answer === option.label}
              onPress={() =>
                onAnswerChange(answer === option.label ? '' : option.label)
              }
            />
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.moreButton,
            pressed && { opacity: 0.7 },
          ]}
          hitSlop={12}
          onPress={onOpenDrawer}
          accessibilityLabel={`Editar detalhes de ${title}`}
        >
          <Icon name="chevron-right" size={18} color={colors.gray[600]} />
        </Pressable>
      </Pressable>
      {transcriptSuggestion && (
        <View style={styles.transcriptSuggestionShell}>
          <Text style={styles.transcriptSuggestionLabel}>Sugestão da IA</Text>
          <View style={styles.transcriptSuggestionActions}>
            <Pressable
              style={({ pressed }) => [
                styles.transcriptSuggestionAction,
                pressed && styles.transcriptSuggestionActionPressed,
              ]}
              onPress={onRejectSuggestion}
              accessibilityLabel={`Descartar sugestão de ${title}`}
            >
              <Icon name="multiply" size={18} color={colors.ink.base} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.transcriptSuggestionAction,
                pressed && styles.transcriptSuggestionActionPressed,
              ]}
              onPress={onAcceptSuggestion}
              accessibilityLabel={`Aceitar sugestão de ${title}`}
            >
              <Icon name="check" size={18} color={colors.ink.base} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  )
})
