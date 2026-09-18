import { useCallback } from 'react'
import { Pressable } from 'react-native'
import { CircularProgress } from '@/components/CircularProgress'
import { Collapsible } from '@/components/Collapsible'
import { colors } from '@/styles'
import { haptics } from '@/utils/haptics'

interface ApplicationItemGroupHeaderProps {
  title: string
  answered: number
  total: number
  /** Fills every item in the group when it isn't fully done yet, clears them all when it is. */
  onToggleAll: () => void
}

/**
 * The shared accordion header plus this screen's one extra: a tappable
 * progress ring. Bar layout, title, count and chevron all come from
 * Collapsible.Header, and the expanded state from its context - there is no
 * second copy of that design here to drift out of sync with the rows below.
 */
export function ApplicationItemGroupHeader({
  title,
  answered,
  total,
  onToggleAll,
}: ApplicationItemGroupHeaderProps) {
  const complete = total > 0 && answered === total

  const handleToggleAll = useCallback(() => {
    haptics.selection()
    onToggleAll()
  }, [onToggleAll])

  return (
    <Collapsible.Header title={title}>
      <Pressable
        hitSlop={10}
        onPress={handleToggleAll}
        accessibilityRole="button"
        accessibilityLabel={complete ? `Desmarcar ${title}` : `Concluir ${title}`}
      >
        <CircularProgress
          progress={total > 0 ? answered / total : 0}
          color={complete ? colors.success.base : colors.blue.base}
        />
      </Pressable>
      <Collapsible.HeaderCount complete={complete}>
        {answered}/{total}
      </Collapsible.HeaderCount>
    </Collapsible.Header>
  )
}
