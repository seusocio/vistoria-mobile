import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { normalizeTagLabel, Tag } from '@/infra/domain/entities'
import { colors } from '@/styles'
import { TagChip } from '../TagChip'
import { styles } from './styles'
import { haptics } from '@/utils/haptics'
import { SheetAwareTextInput } from '../SheetAwareTextInput'

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
  const [isFocused, setIsFocused] = useState(false)

  const suggestions = useMemo(() => {
    const normalizedQuery = normalizeTagLabel(query)
    return availableTags
      .filter((tag) => !selectedIds.includes(tag.id))
      .filter((tag) =>
        normalizedQuery ? tag.normalizedLabel.includes(normalizedQuery) : true,
      )
      .slice(0, 5)
  }, [availableTags, selectedIds, query])

  const hasExactMatch = suggestions.some(
    (tag) => tag.normalizedLabel === normalizeTagLabel(query),
  )
  const showCreateOption = query.trim().length > 0 && !hasExactMatch

  function selectTag(id: string) {
    haptics.selection()
    onChange([...selectedIds, id])
    setQuery('')
  }

  async function handleCreate() {
    const label = query.trim()
    if (!label || creating) return
    setCreating(true)
    try {
      const tag = await onCreateTag(label)
      onChange([...selectedIds, tag.id])
      setQuery('')
    } finally {
      setCreating(false)
    }
  }

  function removeTag(id: string) {
    onChange(selectedIds.filter((selectedId) => selectedId !== id))
  }

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.box,
          variant === 'accent' && styles.boxAccent,
          variant === 'muted' && styles.boxMuted,
        ]}
      >
        {selectedIds.map((id) => (
          <TagChip
            key={id}
            label={allTagsById.get(id)?.label ?? '—'}
            onRemove={() => removeTag(id)}
          />
        ))}
        <SheetAwareTextInput
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={colors.gray[400]}
          style={styles.input}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onSubmitEditing={() => {
            if (suggestions[0]) selectTag(suggestions[0].id)
            else handleCreate()
          }}
          accessibilityLabel="Adicionar tag"
        />
      </View>

      {isFocused && (suggestions.length > 0 || showCreateOption) && (
        <View style={styles.suggestions}>
          {suggestions.map((tag) => (
            <Pressable
              key={tag.id}
              style={({ pressed }) => [
                styles.suggestionRow,
                pressed && { opacity: 0.7 },
              ]}
              onPressIn={() => selectTag(tag.id)}
            >
              <Text style={styles.suggestionText}>{tag.label}</Text>
            </Pressable>
          ))}
          {showCreateOption && (
            <Pressable
              style={({ pressed }) => [
                styles.suggestionRow,
                pressed && { opacity: 0.7 },
              ]}
              onPressIn={handleCreate}
              disabled={creating}
            >
              <Text style={styles.createText}>
                {creating ? 'Criando...' : `+ Criar "${query.trim()}"`}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}
