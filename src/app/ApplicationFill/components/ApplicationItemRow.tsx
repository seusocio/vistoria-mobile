import { memo } from 'react'
import { useReorderableDrag } from 'react-native-reorderable-list'
import { ItemCard } from '@/components/ItemCard'
import type { ApplicationItem, ResponseOption } from '@/infra/domain/entities'
import { colors } from '@/styles'
import { haptics } from '@/utils/haptics'

interface ApplicationItemRowProps {
  item: ApplicationItem
  canDrag: boolean
  options: ResponseOption[]
  tagLabel?: string
  suggestionEnabled: boolean
  onAnswerChange: (itemId: string, answer: string) => void
  onOpenDrawer: (itemId: string) => void
  onAcceptSuggestion?: (itemId: string) => void
  onRejectSuggestion?: (itemId: string) => void
}

export const ApplicationItemRow = memo(function ApplicationItemRow({
  item,
  canDrag,
  options,
  tagLabel,
  suggestionEnabled,
  onAnswerChange,
  onOpenDrawer,
  onAcceptSuggestion,
  onRejectSuggestion,
}: ApplicationItemRowProps) {
  const drag = useReorderableDrag()
  const suggested = suggestionEnabled && item.suggested
  const transcriptSuggestion = suggested && item.suggestionSource === 'transcript'
  const photosCount = item.attachments.filter((attachment) => !attachment.deletedAt).length

  return (
    <ItemCard.Root
      style={suggested ? { backgroundColor: colors.white } : undefined}
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
      <ItemCard.Content>
        <ItemCard.Title>{item.title}</ItemCard.Title>
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
      <ItemCard.Actions>
        {options.map((option) => (
          <ItemCard.AnswerToggle
            key={option.label}
            option={option}
            selected={item.answer === option.label}
            onPress={() =>
              onAnswerChange(item.id, item.answer === option.label ? '' : option.label)
            }
          />
        ))}
      </ItemCard.Actions>
    </ItemCard.Root>
  )
})
