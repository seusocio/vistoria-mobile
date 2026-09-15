import { memo, type RefObject } from 'react'
import { Text, View, type TextInput } from 'react-native'
import { Tag } from '@/infra/domain/entities'
import { colors } from '@/styles'
import { Icon } from '../../Icon'
import { TagChipList } from '../../TagChipList'
import { SheetAwareTextInput } from '../../SheetAwareTextInput'
import { styles } from '../styles'

interface TagMultiSelectSheetHeaderProps {
  draftIds: string[]
  tagOptions: Tag[]
  query: string
  placeholder: string
  inputRef: RefObject<TextInput | null>
  onQueryChange: (query: string) => void
  onToggle: (id: string) => void
}

export const TagMultiSelectSheetHeader = memo(function TagMultiSelectSheetHeader({
  draftIds,
  tagOptions,
  query,
  placeholder,
  inputRef,
  onQueryChange,
  onToggle,
}: TagMultiSelectSheetHeaderProps) {
  const selectedLabels = draftIds
    .map((id) => tagOptions.find((tag) => tag.id === id)?.label)
    .filter((label): label is string => Boolean(label))
  return (
    <View style={styles.sheetContent}>
      <Text style={styles.sheetTitle}>Selecionar tags</Text>
      <Text style={styles.sheetSubtitle}>Escolha uma ou mais classificações</Text>
      {selectedLabels.length > 0 ? (
        <TagChipList
          labels={selectedLabels}
          onRemove={(_, index) => onToggle(draftIds[index])}
        />
      ) : null}
      <View style={styles.searchBox}>
        <Icon name="search" size={18} color={colors.gray[400]} />
        <SheetAwareTextInput
          ref={inputRef}
          value={query}
          onChangeText={onQueryChange}
          placeholder={placeholder}
          placeholderTextColor={colors.gray[400]}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={placeholder}
        />
      </View>
    </View>
  )
})
