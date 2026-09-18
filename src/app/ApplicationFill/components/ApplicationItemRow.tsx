import { memo } from 'react'
import { Text, View } from 'react-native'
import { useReorderableDrag } from 'react-native-reorderable-list'
import { ItemCard, ITEM_COMPLETION_VARIANT_COLOR, type ItemCompletionVariant } from '@/components/ItemCard'
import type { ApplicationItem } from '@/infra/domain/entities'
import { colors } from '@/styles'
import { haptics } from '@/utils/haptics'
import { styles } from './ApplicationItemRow.styles'

const STATUS_LABEL: Partial<Record<ItemCompletionVariant, string>> = {
  in_progress: 'executando',
  in_review: 'em revisão',
  denied: 'negado na revisão',
}

interface ApplicationItemRowProps {
  item: ApplicationItem
  canDrag: boolean
  completionVariant: ItemCompletionVariant
  tagLabel?: string
  suggestionEnabled: boolean
  onToggleComplete: (itemId: string) => void
  onOpenDrawer: (itemId: string) => void
  onAcceptSuggestion?: (itemId: string) => void
  onRejectSuggestion?: (itemId: string) => void
}

export const ApplicationItemRow = memo(function ApplicationItemRow({
  item,
  canDrag,
  completionVariant,
  tagLabel,
  suggestionEnabled,
  onToggleComplete,
  onOpenDrawer,
  onAcceptSuggestion,
  onRejectSuggestion,
}: ApplicationItemRowProps) {
  const drag = useReorderableDrag()
  const suggested = suggestionEnabled && item.suggested
  const transcriptSuggestion = suggested && item.suggestionSource === 'transcript'
  const photosCount = item.attachments.filter((attachment) => !attachment.deletedAt).length
  const statusLabel = STATUS_LABEL[completionVariant]

  return (
    <ItemCard.Root
      style={[styles.rowContainer, suggested && { backgroundColor: colors.blue.tint }]}
      shellStyle={
        transcriptSuggestion
          ? { padding: 6, paddingBottom: 0, backgroundColor: colors.blue.tint }
          : undefined
      }
      onPress={() => onOpenDrawer(item.id)}
      onDragStart={
        canDrag
          ? () => {
              haptics.dragStart()
              drag()
            }
          : undefined
      }
      accessibilityLabel={`Editar detalhes de ${item.title}`}
      footer={
        transcriptSuggestion ? (
          <ItemCard.SuggestionPanel
            onAccept={() => onAcceptSuggestion?.(item.id)}
            onReject={() => onRejectSuggestion?.(item.id)}
            acceptLabel={`Aceitar sugestão de ${item.title}`}
            rejectLabel={`Descartar sugestão de ${item.title}`}
          />
        ) : null
      }
    >
      <ItemCard.StatusDot
        variant={completionVariant}
        onPress={() => onToggleComplete(item.id)}
        accessibilityLabel={`Status de ${item.title}`}
      />
      <ItemCard.Content
        style={completionVariant === 'completed' ? styles.completedContent : undefined}
      >
        <View style={styles.titleRow}>
          <ItemCard.Title style={styles.title}>{item.title}</ItemCard.Title>
          {statusLabel ? (
            <Text
              style={[styles.statusLabel, { color: ITEM_COMPLETION_VARIANT_COLOR[completionVariant] }]}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
          ) : null}
        </View>
        <ItemCard.Meta>
          {tagLabel ? <ItemCard.MetaItem icon="tag">{tagLabel}</ItemCard.MetaItem> : null}
          {item.note ? <ItemCard.MetaItem icon="note-with-text" /> : null}
          {photosCount > 0 ? (
            <ItemCard.MetaItem icon="camera">{photosCount}</ItemCard.MetaItem>
          ) : null}
          {item.quantity !== null ? (
            <ItemCard.MetaItem>{`Qtd ${item.quantity}`}</ItemCard.MetaItem>
          ) : null}
        </ItemCard.Meta>
      </ItemCard.Content>
    </ItemCard.Root>
  )
})
