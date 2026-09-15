import { memo } from 'react'
import { Pressable } from 'react-native'
import { useReorderableDrag } from 'react-native-reorderable-list'
import { Icon } from '@/components/Icon'
import { ItemCard } from '@/components/ItemCard'
import type { ApplicationItem, ResponseOption } from '@/infra/domain/entities'
import { colors } from '@/styles'
import { haptics } from '@/utils/haptics'
import { styles } from '../styles'

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
  return (
    <ItemCard
      dragHandle={
        <Pressable
          style={styles.dragHandle}
          disabled={!canDrag}
          onLongPress={
            canDrag
              ? () => {
                  haptics.dragStart()
                  drag()
                }
              : undefined
          }
          delayLongPress={520}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={canDrag ? `Reordenar item ${item.title}` : 'Item avulso'}
          accessibilityState={{ disabled: !canDrag }}
        >
          <Icon
            name="grip-vertical"
            size={18}
            color={canDrag ? colors.gray[400] : colors.gray[200]}
          />
        </Pressable>
      }
      title={item.title}
      tagLabel={tagLabel}
      hasNote={Boolean(item.note)}
      photosCount={item.attachments.filter((attachment) => !attachment.deletedAt).length}
      quantity={item.quantity}
      suggested={suggestionEnabled ? item.suggested : false}
      suggestionSource={suggestionEnabled ? item.suggestionSource : null}
      options={options}
      answer={item.answer}
      onAnswerChange={(answer) => onAnswerChange(item.id, answer)}
      onOpenDrawer={() => onOpenDrawer(item.id)}
      onAcceptSuggestion={
        suggestionEnabled ? () => onAcceptSuggestion?.(item.id) : undefined
      }
      onRejectSuggestion={
        suggestionEnabled ? () => onRejectSuggestion?.(item.id) : undefined
      }
    />
  )
})
