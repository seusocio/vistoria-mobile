import { memo } from 'react'
import { Controller, useFieldArray } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import { Pressable, TextInput, View } from 'react-native'
import { Icon } from '@/components/Icon'
import type { ResponseSemantic } from '@/features/checklist/shared/checklist.types'
import { colors } from '@/styles'
import type { ChecklistFormValues } from '../checklist-form.schema'
import { styles } from '../checklist-form.styles'

const SEMANTIC_DOT_COLOR: Partial<Record<ResponseSemantic, string>> = {
  positivo: colors.success.base,
  negativo: colors.danger.base,
  neutro: colors.warning.base,
}
const SEMANTIC_LABEL: Partial<Record<ResponseSemantic, string>> = {
  positivo: 'Positivo',
  negativo: 'Negativo',
  neutro: 'Neutro',
}
const NEXT_SEMANTIC: Partial<Record<ResponseSemantic, ResponseSemantic>> = {
  positivo: 'negativo',
  negativo: 'neutro',
  neutro: 'positivo',
}

interface ResponseOptionsEditorProps {
  control: Control<ChecklistFormValues>
  onRemoveOption: (index: number) => void
}

export const ResponseOptionsEditor = memo(function ResponseOptionsEditor({
  control,
  onRemoveOption,
}: ResponseOptionsEditorProps) {
  const { fields } = useFieldArray({ control, name: 'options' })
  return (
    <View style={styles.optionsRow}>
      {fields.map((field, index) => (
        <View key={field.id} style={styles.optionPill}>
          <Controller
            control={control}
            name={`options.${index}.semantic`}
            render={({ field: semanticField }) => (
              <Pressable
                hitSlop={8}
                onPress={() =>
                  semanticField.onChange(
                    NEXT_SEMANTIC[semanticField.value] ?? 'neutro',
                  )
                }
                accessibilityLabel={`Significado da opção: ${SEMANTIC_LABEL[semanticField.value] ?? semanticField.value}. Toque para alternar`}
              >
                <View
                  style={[
                    styles.optionDot,
                    {
                      backgroundColor:
                        SEMANTIC_DOT_COLOR[semanticField.value] ?? colors.gray[400],
                    },
                  ]}
                />
              </Pressable>
            )}
          />
          <Controller
            control={control}
            name={`options.${index}.label`}
            render={({ field: labelField }) => (
              <TextInput
                style={styles.optionInput}
                value={labelField.value}
                onChangeText={labelField.onChange}
                placeholder="Rótulo"
                placeholderTextColor={colors.gray[400]}
              />
            )}
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
