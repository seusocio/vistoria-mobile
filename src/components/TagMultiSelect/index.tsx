import { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Pressable, Text, View, type ScrollViewProps, type TextInput } from 'react-native'
import { normalizeTagLabel, Tag } from '@/infra/domain/entities'
import { colors, duration } from '@/styles'
import { haptics } from '@/utils/haptics'
import { AppBottomSheet } from '../AppBottomSheet'
import { Icon } from '../Icon'
import { TagChipList } from '../TagChipList'
import { useSheetFooterActions } from '../SheetFooterActions'
import { TagMultiSelectSheetHeader } from './components/TagMultiSelectSheetHeader'
import { TagOptionRow } from './components/TagOptionRow'
import { styles } from './styles'

const SheetScrollView = BottomSheetScrollView as unknown as ComponentType<ScrollViewProps>

export interface TagMultiSelectProps {
  selectedIds: string[]
  availableTags: Tag[]
  allTagsById: Map<string, Tag>
  onChange: (ids: string[]) => void
  onCreateTag: (label: string) => Promise<Tag>
  placeholder?: string
  variant?: 'default' | 'accent' | 'muted'
}

const tagKeyExtractor = (tag: Tag) => tag.id
const OptionSeparator = () => <View style={styles.optionSeparator} />

const TagCreateOption = memo(function TagCreateOption({
  query,
  creating,
  onPress,
}: {
  query: string
  creating: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
      onPress={onPress}
      disabled={creating}
    >
      <Text style={styles.createText}>
        {creating ? 'Criando...' : `+ Criar "${query.trim()}"`}
      </Text>
    </Pressable>
  )
})

const TagEmpty = memo(function TagEmpty() {
  return <Text style={styles.emptyText}>Nenhuma tag encontrada.</Text>
})

export function TagMultiSelect({
  selectedIds,
  availableTags,
  allTagsById,
  onChange,
  onCreateTag,
  placeholder = 'Buscar tags',
  variant = 'default',
}: TagMultiSelectProps) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [visible, setVisible] = useState(false)
  const [draftIds, setDraftIds] = useState(selectedIds)
  const [createdTags, setCreatedTags] = useState<Map<string, Tag>>(new Map())
  const queryInputRef = useRef<TextInput>(null)

  useEffect(() => {
    if (!visible) return
    const focusTimer = setTimeout(
      () => queryInputRef.current?.focus(),
      duration.sheet,
    )
    return () => clearTimeout(focusTimer)
  }, [visible])

  const selectedLabels = selectedIds
    .map((id) => allTagsById.get(id)?.label ?? createdTags.get(id)?.label)
    .filter((label): label is string => Boolean(label))
  const tagOptions = useMemo(() => {
    const options = new Map(availableTags.map((tag) => [tag.id, tag]))
    for (const tag of createdTags.values()) {
      if (!options.has(tag.id)) options.set(tag.id, tag)
    }
    return Array.from(options.values())
  }, [availableTags, createdTags])
  const normalizedQuery = normalizeTagLabel(query)
  const suggestions = useMemo(
    () =>
      tagOptions.filter((tag) =>
        normalizedQuery ? tag.normalizedLabel.includes(normalizedQuery) : true,
      ),
    [normalizedQuery, tagOptions],
  )
  const hasExactMatch = tagOptions.some(
    (tag) => tag.normalizedLabel === normalizedQuery,
  )
  const showCreateOption = query.trim().length > 0 && !hasExactMatch

  const openSheet = useCallback(() => {
    setDraftIds(selectedIds)
    setQuery('')
    setVisible(true)
  }, [selectedIds])
  const closeSheet = useCallback(() => {
    setDraftIds(selectedIds)
    setQuery('')
    setVisible(false)
  }, [selectedIds])
  const commitSelection = useCallback(() => {
    onChange(draftIds)
    setQuery('')
    setVisible(false)
  }, [draftIds, onChange])
  const toggleTag = useCallback((id: string) => {
    haptics.selection()
    setDraftIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    )
  }, [])
  const removeSelectedTag = useCallback(
    (index: number) => {
      const id = selectedIds[index]
      if (!id) return
      const nextIds = selectedIds.filter((selectedId) => selectedId !== id)
      onChange(nextIds)
      setDraftIds((current) => current.filter((selectedId) => selectedId !== id))
    },
    [onChange, selectedIds],
  )
  const handleCreate = useCallback(async () => {
    const label = query.trim()
    if (!label || creating) return
    setCreating(true)
    try {
      const tag = await onCreateTag(label)
      setCreatedTags((current) => new Map(current).set(tag.id, tag))
      setDraftIds((current) => [...current, tag.id])
      setQuery('')
      haptics.selection()
    } finally {
      setCreating(false)
    }
  }, [creating, onCreateTag, query])
  const footerComponent = useSheetFooterActions({
    confirmLabel: 'Concluído',
    onConfirm: commitSelection,
  })
  const renderOption = useCallback(
    ({ item }: LegendListRenderItemProps<Tag>) => (
      <TagOptionRow
        label={item.label}
        selected={draftIds.includes(item.id)}
        onPress={() => toggleTag(item.id)}
      />
    ),
    [draftIds, toggleTag],
  )
  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => <SheetScrollView {...props} />,
    [],
  )

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.row,
          variant === 'accent' && styles.rowAccent,
          variant === 'muted' && styles.rowMuted,
          pressed && styles.pressed,
        ]}
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={placeholder}
        accessibilityHint="Abre a seleção de tags"
      >
        <Icon name="search" size={18} color={colors.gray[400]} />
        <View style={styles.rowContent}>
          {selectedLabels.length === 0 ? (
            <Text style={styles.rowValueEmpty}>{placeholder}</Text>
          ) : (
            <TagChipList
              labels={selectedLabels}
              tone="primary"
              onRemove={(_, index) => removeSelectedTag(index)}
            />
          )}
        </View>
      </Pressable>
      <AppBottomSheet
        visible={visible}
        onClose={closeSheet}
        snapPoints={['50%', '90%']}
        footerComponent={footerComponent}
      >
        <LegendList
          data={suggestions}
          renderItem={renderOption}
          keyExtractor={tagKeyExtractor}
          renderScrollComponent={renderScrollComponent}
          ListHeaderComponent={
            <TagMultiSelectSheetHeader
              draftIds={draftIds}
              tagOptions={tagOptions}
              query={query}
              placeholder={placeholder}
              inputRef={queryInputRef}
              onQueryChange={setQuery}
              onToggle={toggleTag}
            />
          }
          ListFooterComponent={
            showCreateOption ? (
              <TagCreateOption
                query={query}
                creating={creating}
                onPress={handleCreate}
              />
            ) : null
          }
          ListEmptyComponent={suggestions.length === 0 && !showCreateOption ? <TagEmpty /> : null}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={OptionSeparator}
          estimatedItemSize={52}
          recycleItems
          showsVerticalScrollIndicator={false}
        />
      </AppBottomSheet>
    </>
  )
}
