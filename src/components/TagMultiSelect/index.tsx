import {
  BottomSheetFooter,
  BottomSheetScrollView,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet'
import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { normalizeTagLabel, Tag } from '@/infra/domain/entities'
import { colors } from '@/styles'
import { haptics } from '@/utils/haptics'
import { AppBottomSheet } from '../AppBottomSheet'
import { Icon } from '../Icon'
import { SheetAwareTextInput } from '../SheetAwareTextInput'
import { TagChip } from '../TagChip'
import { styles } from './styles'

export interface TagMultiSelectProps {
  selectedIds: string[]
  availableTags: Tag[]
  allTagsById: Map<string, Tag>
  onChange: (ids: string[]) => void
  onCreateTag: (label: string) => Promise<Tag>
  placeholder?: string
  /** default = NovoChecklist/NovaAplicacao TagBox; accent = Overview TagFilterField; muted = ItemDrawer TagBox */
  variant?: 'default' | 'accent' | 'muted'
}

export function TagMultiSelect({
  selectedIds,
  availableTags,
  allTagsById,
  onChange,
  onCreateTag,
  placeholder = 'Adicionar tag...',
  variant = 'default',
}: TagMultiSelectProps) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [visible, setVisible] = useState(false)
  const [draftIds, setDraftIds] = useState(selectedIds)
  const [createdTags, setCreatedTags] = useState<Map<string, Tag>>(new Map())

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

  function openSheet() {
    setDraftIds(selectedIds)
    setQuery('')
    setVisible(true)
  }

  function closeSheet() {
    setDraftIds(selectedIds)
    setQuery('')
    setVisible(false)
  }

  function commitSelection() {
    onChange(draftIds)
    setQuery('')
    setVisible(false)
  }

  function toggleTag(id: string) {
    haptics.selection()
    setDraftIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    )
  }
  function removeSelectedTag(id: string) {
    const nextIds = selectedIds.filter((selectedId) => selectedId !== id)
    onChange(nextIds)
    setDraftIds((current) =>
      current.filter((selectedId) => selectedId !== id),
    )
  }

  async function handleCreate() {
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
  }
  function renderFooter(props: BottomSheetFooterProps) {
    return (
      <BottomSheetFooter {...props} style={styles.sheetFooter}>
        <Pressable
          style={({ pressed }) => [
            styles.doneButton,
            pressed && styles.pressed,
          ]}
          onPress={commitSelection}
          accessibilityRole="button"
          accessibilityLabel="Concluir seleção de tags"
        >
          <Text style={styles.doneButtonText}>
            Concluído ({draftIds.length})
          </Text>
        </Pressable>
      </BottomSheetFooter>
    )
  }

  return (
    <>
      <View
        style={[
          styles.row,
          variant === 'accent' && styles.rowAccent,
          variant === 'muted' && styles.rowMuted,
        ]}
      >
        <View style={styles.rowContent}>
          <Pressable
            style={({ pressed }) => [
              styles.rowTapArea,
              pressed && styles.pressed,
            ]}
            onPress={openSheet}
            accessibilityRole="button"
            accessibilityLabel={placeholder}
            accessibilityHint="Abre a seleção de tags"
          >
            <Text style={styles.rowLabel}>Tags</Text>
            {selectedLabels.length === 0 ? (
              <Text style={styles.rowValueEmpty}>
                Nenhuma tag selecionada
              </Text>
            ) : null}
          </Pressable>
          {selectedLabels.length > 0 ? (
            <View style={styles.chips}>
              {selectedIds.map((id) => {
                const label =
                  allTagsById.get(id)?.label ?? createdTags.get(id)?.label
                return label ? (
                  <TagChip
                    key={id}
                    label={label}
                    tone="neutral"
                    onRemove={() => removeSelectedTag(id)}
                  />
                ) : null
              })}
            </View>
          ) : null}
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.rowChevron,
            pressed && styles.pressed,
          ]}
          onPress={openSheet}
          accessibilityRole="button"
          accessibilityLabel={placeholder}
        >
          <Icon name="chevron-right" size={18} color={colors.gray[400]} />
        </Pressable>
      </View>

      <AppBottomSheet
        visible={visible}
        onClose={closeSheet}
        snapPoints={['50%', '90%']}
        footerComponent={renderFooter}
      >

        <BottomSheetScrollView
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sheetTitle}>Selecionar tags</Text>
          <Text style={styles.sheetSubtitle}>
            Escolha uma ou mais classificações
          </Text>
          {draftIds.length > 0 ? (
            <View style={styles.selectedChips}>
              {draftIds.map((id) => {
                const tag = tagOptions.find((option) => option.id === id)
                return tag ? (
                  <TagChip
                    key={tag.id}
                    label={tag.label}
                    onRemove={() => toggleTag(tag.id)}
                  />
                ) : null
              })}
            </View>
          ) : null}
          <View style={styles.searchBox}>
            <Icon name="search" size={18} color={colors.gray[400]} />
            <SheetAwareTextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar tags"
              placeholderTextColor={colors.gray[400]}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Buscar tags"
            />
          </View>
          <View style={styles.options}>
            {suggestions.map((tag) => {
              const selected = draftIds.includes(tag.id)
              return (
                <Pressable
                  key={tag.id}
                  style={({ pressed }) => [
                    styles.option,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => toggleTag(tag.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                >
                  <Text style={styles.optionText}>{tag.label}</Text>
                  <View style={[styles.check, selected && styles.checkSelected]}>
                    {selected ? (
                      <Icon name="check" size={14} color={colors.white} />
                    ) : null}
                  </View>
                </Pressable>
              )
            })}
            {showCreateOption ? (
              <Pressable
                style={({ pressed }) => [
                  styles.option,
                  pressed && styles.pressed,
                ]}
                onPress={handleCreate}
                disabled={creating}
              >
                <Text style={styles.createText}>
                  {creating ? 'Criando...' : `+ Criar "${query.trim()}"`}
                </Text>
              </Pressable>
            ) : null}
            {suggestions.length === 0 && !showCreateOption ? (
              <Text style={styles.emptyText}>Nenhuma tag encontrada.</Text>
            ) : null}
          </View>
        </BottomSheetScrollView>
      </AppBottomSheet>
    </>
  )
}
