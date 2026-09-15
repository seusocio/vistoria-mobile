import { memo } from 'react'
import { View } from 'react-native'
import { TagChip, type TagChipProps } from '../TagChip'
import { styles } from './styles'

export interface TagChipListProps {
  labels: string[]
  tone?: TagChipProps['tone']
  onRemove?: (label: string, index: number) => void
}

export const TagChipList = memo(function TagChipList({
  labels,
  tone,
  onRemove,
}: TagChipListProps) {
  return (
    <View style={styles.container}>
      {labels.map((label, index) => (
        <TagChip
          key={label}
          label={label}
          tone={tone}
          onRemove={onRemove ? () => onRemove(label, index) : undefined}
        />
      ))}
    </View>
  )
})
