import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { styles } from '../checklist-library.styles'

interface LibraryEmptyProps {
  hasChecklists: boolean
  hasFilters: boolean
  onClearFilters: () => void
}

export const LibraryEmpty = memo(function LibraryEmpty({
  hasChecklists,
  hasFilters,
  onClearFilters,
}: LibraryEmptyProps) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>
        {hasChecklists
          ? 'Nenhum checklist encontrado para estes filtros.'
          : 'Nenhum checklist ainda. Crie o primeiro para começar.'}
      </Text>
      {hasFilters ? (
        <Pressable
          onPress={onClearFilters}
          style={({ pressed }) => [
            styles.clearFiltersButton,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.clearFiltersText}>Limpar filtros</Text>
        </Pressable>
      ) : null}
    </View>
  )
})
