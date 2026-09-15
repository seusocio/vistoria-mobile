import { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { LegendList } from '@legendapp/list/react-native'
import { memo, useCallback } from 'react'
import type { ComponentType } from 'react'
import { Pressable, Text, View, type ScrollViewProps } from 'react-native'
import { AppBottomSheet, TagChip } from '@/components'
import { Icon } from '@/components/Icon'
import type { Tag } from '@/infra/domain/entities'
import { colors } from '@/styles'
import { styles } from '../styles'
const SheetScrollView = BottomSheetScrollView as unknown as ComponentType<ScrollViewProps>

interface LibraryTagFilterSheetProps {
  visible: boolean
  onClose: () => void
  filterTags: Tag[]
  activeTagId: string | null
  onSelect: (tagId: string | null) => void
}

const FilterOption = memo(function FilterOption({
  tag,
  activeTagId,
  onSelect,
}: {
  tag: Tag
  activeTagId: string | null
  onSelect: (tagId: string) => void
}) {
  const active = activeTagId === tag.id
  return (
    <Pressable
      style={({ pressed }) => [
        styles.filterOption,
        active && styles.filterOptionActive,
        pressed && styles.pressed,
      ]}
      onPress={() => onSelect(tag.id)}
      accessibilityRole="radio"
      accessibilityLabel={`Filtrar por ${tag.label}`}
      accessibilityState={{ selected: active }}
    >
      <TagChip label={tag.label} tone={active ? 'primary' : 'neutral'} />
      {active ? <Icon name="check" size={18} color={colors.blue.base} /> : null}
    </Pressable>
  )
})

export const LibraryTagFilterSheet = memo(function LibraryTagFilterSheet({
  visible,
  onClose,
  filterTags,
  activeTagId,
  onSelect,
}: LibraryTagFilterSheetProps) {
  const renderItem = useCallback(
    ({ item }: { item: Tag }) => (
      <FilterOption
        tag={item}
        activeTagId={activeTagId}
        onSelect={(tagId) => onSelect(tagId)}
      />
    ),
    [activeTagId, onSelect],
  )
  const header = (
    <View style={styles.filterSheet}>
      <Text style={styles.filterSheetTitle}>Filtrar modelos</Text>
      <Text style={styles.filterSheetSubtitle}>
        Mostrando checklists que usam a tag escolhida
      </Text>
      <Pressable
        style={({ pressed }) => [
          styles.filterOption,
          activeTagId === null && styles.filterOptionActive,
          pressed && styles.pressed,
        ]}
        onPress={() => onSelect(null)}
        accessibilityRole="radio"
        accessibilityState={{ selected: activeTagId === null }}
      >
        <Text style={styles.filterOptionText}>Todos</Text>
        {activeTagId === null ? (
          <Icon name="check" size={18} color={colors.blue.base} />
        ) : null}
      </Pressable>
    </View>
  )

  return (
    <AppBottomSheet visible={visible} onClose={onClose} snapPoints={['50%']}>
      <LegendList
        data={filterTags}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.filterSheet}
        renderScrollComponent={(props: ScrollViewProps) => (
          <SheetScrollView {...props} />
        )}
        estimatedItemSize={56}
        recycleItems
        showsVerticalScrollIndicator={false}
      />
    </AppBottomSheet>
  )
})
