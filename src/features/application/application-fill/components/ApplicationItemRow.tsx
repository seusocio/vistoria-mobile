import { memo, useCallback, useMemo } from 'react'
import { Text, View } from 'react-native'
import { useReorderableDrag } from 'react-native-reorderable-list'
import { Collapsible } from '@/components/Collapsible'
import {
  ITEM_COMPLETION_VARIANT_COLOR,
  ItemCard,
  type ItemCompletionVariant,
} from '@/components/ItemCard'
import type { ApplicationItem } from '@/features/application/shared/application.types'
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
  const statusLabel = STATUS_LABEL[completionVariant]

  // A filter() here allocates a throwaway array per row on every pass; items on
  // a busy application carry a lot of attachments.
  const photosCount = useMemo(() => {
    let count = 0
    for (const attachment of item.attachments) {
      if (!attachment.deletedAt) count += 1
    }
    return count
  }, [item.attachments])

  const statusLabelStyle = useMemo(
    () => [
      styles.statusLabel,
      { color: ITEM_COMPLETION_VARIANT_COLOR[completionVariant] },
    ],
    [completionVariant],
  )

  const handlePress = useCallback(
    () => onOpenDrawer(item.id),
    [onOpenDrawer, item.id],
  )
  const handleToggleComplete = useCallback(
    () => onToggleComplete(item.id),
    [onToggleComplete, item.id],
  )
  const handleAccept = useCallback(
    () => onAcceptSuggestion?.(item.id),
    [onAcceptSuggestion, item.id],
  )
  const handleReject = useCallback(
    () => onRejectSuggestion?.(item.id),
    [onRejectSuggestion, item.id],
  )
  const handleDragStart = useCallback(() => {
    haptics.dragStart()
    drag()
  }, [drag])

  return (
    <Collapsible.Row
      style={suggested ? styles.suggestedRow : undefined}
      shellStyle={transcriptSuggestion ? styles.suggestionShell : undefined}
      onPress={handlePress}
      onDragStart={canDrag ? handleDragStart : undefined}
      accessibilityLabel={`Editar detalhes de ${item.title}`}
      footer={
        transcriptSuggestion ? (
          <ItemCard.SuggestionPanel
            onAccept={handleAccept}
            onReject={handleReject}
            acceptLabel={`Aceitar sugestão de ${item.title}`}
            rejectLabel={`Descartar sugestão de ${item.title}`}
          />
        ) : null
      }
    >
      <ItemCard.StatusDot
        variant={completionVariant}
        onPress={handleToggleComplete}
        accessibilityLabel={`Status de ${item.title}`}
      />
      <ItemCard.Content
        style={completionVariant === 'completed' ? styles.completedContent : undefined}
      >
        <View style={styles.titleRow}>
          <Collapsible.RowTitle>{item.title}</Collapsible.RowTitle>
          {statusLabel ? (
            <Text style={statusLabelStyle} numberOfLines={1}>
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
    </Collapsible.Row>
  )
})
