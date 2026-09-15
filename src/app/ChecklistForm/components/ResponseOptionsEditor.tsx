import { memo } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { Icon } from '@/components/Icon'
import type { ChecklistFormApi } from '@/hooks/useChecklistForm'
import type { ResponseSemantic } from '@/infra/domain/entities'
import { colors } from '@/styles'
import { styles } from '../styles'

const SEMANTIC_DOT_COLOR: Record<ResponseSemantic, string> = {
  positivo: colors.success.base,
  negativo: colors.danger.base,
  neutro: colors.warning.base,
}
const SEMANTIC_LABEL: Record<ResponseSemantic, string> = {
  positivo: 'Positivo',
  negativo: 'Negativo',
  neutro: 'Neutro',
}
const NEXT_SEMANTIC: Record<ResponseSemantic, ResponseSemantic> = {
  positivo: 'negativo',
  negativo: 'neutro',
  neutro: 'positivo',
}

interface ResponseOptionsEditorProps {
  form: ChecklistFormApi
  onRemoveOption: (index: number) => void
}

export const ResponseOptionsEditor = memo(function ResponseOptionsEditor({
  form,
  onRemoveOption,
}: ResponseOptionsEditorProps) {
  return (
    <View style={styles.optionsRow}>
      {form.options.map((option, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: options are positional and have no stable id before saving
        <View key={index} style={styles.optionPill}>
          <Pressable
            hitSlop={8}
            onPress={() =>
              form.updateOptionSemantic(index, NEXT_SEMANTIC[option.semantic])
            }
            accessibilityLabel={`Significado da opção: ${SEMANTIC_LABEL[option.semantic]}. Toque para alternar`}
          >
            <View
              style={[
                styles.optionDot,
                { backgroundColor: SEMANTIC_DOT_COLOR[option.semantic] },
              ]}
            />
          </Pressable>
          <TextInput
            style={styles.optionInput}
            value={option.label}
            onChangeText={(value) => form.updateOptionLabel(index, value)}
            placeholder="Rótulo"
            placeholderTextColor={colors.gray[400]}
          />
          <Pressable
            style={({ pressed }) => pressed && { opacity: 0.7 }}
            hitSlop={12}
            onPress={() => onRemoveOption(index)}
          >
            <Icon name="multiply" size={12} color={colors.gray[400]} />
          </Pressable>
        </View>
      ))}
    </View>
  )
})
