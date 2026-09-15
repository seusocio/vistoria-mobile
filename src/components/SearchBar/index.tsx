import { Pressable, View } from 'react-native'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { SheetAwareTextInput } from '../SheetAwareTextInput'
import { styles } from './styles'

export interface SearchBarProps {
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
}

/** Component/SearchBar */
export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Pesquisar por nome ou tag',
}: SearchBarProps) {
  return (
    <View style={styles.container} accessibilityRole="search">
      <Icon name="search" size={18} color={colors.gray[600]} />
      <SheetAwareTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.gray[400]}
        style={styles.input}
        accessibilityLabel={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          style={styles.clearButton}
          accessibilityRole="button"
          accessibilityLabel="Limpar busca"
          hitSlop={12}
        >
          <Icon name="multiply" size={14} color={colors.gray[600]} />
        </Pressable>
      ) : null}
    </View>
  )
}
