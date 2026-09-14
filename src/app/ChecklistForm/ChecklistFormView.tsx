import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { ConfirmBottomSheet, Input, TagMultiSelect } from '@/components'
import { Icon, IconName } from '@/components/Icon'
import { ChecklistFormApi } from '@/hooks/useChecklistForm'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { ChecklistTemplate } from '@/infra/data/templates'
import { ResponseSemantic } from '@/infra/domain/entities'
import { colors } from '@/styles'
import { styles } from './styles'

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

const TEMPLATE_ICON: Record<string, IconName> = {
  'template-vistoria-entrega': 'clipboard-check',
  'template-areas-comuns': 'shop',
  'template-instalacao-hidraulica': 'droplet',
}

export interface ChecklistFormViewProps {
  form: ChecklistFormApi
  tagsCatalog: ReturnType<typeof useTagsCatalog>
  templates?: ChecklistTemplate[]
  selectedTemplateId?: string | null
  onSelectTemplate?: (template: ChecklistTemplate) => void
  error?: string | null
}

export function ChecklistFormView({
  form,
  tagsCatalog,
  templates,
  selectedTemplateId,
  onSelectTemplate,
  error,
}: ChecklistFormViewProps) {
  const { activeTags, tagsById, createTag } = tagsCatalog
  const [pendingDelete, setPendingDelete] = useState<
    { type: 'option'; index: number } | { type: 'item'; key: string } | null
  >(null)

  return (
    <View style={styles.container}>
      {templates && templates.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.fieldLabel}>Começar a partir de um modelo</Text>
          <View style={styles.templateRow}>
            {templates.map((template) => {
              const isSelected = template.id === selectedTemplateId
              return (
                <Pressable
                  key={template.id}
                  style={({ pressed }) => [
                    styles.templateCard,
                    isSelected && styles.templateCardSelected,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => onSelectTemplate?.(template)}
                >
                  <Icon
                    name={TEMPLATE_ICON[template.id] ?? 'clipboard-check'}
                    size={20}
                    color={isSelected ? colors.blue.base : colors.gray[600]}
                  />
                  <Text
                    style={[
                      styles.templateLabel,
                      isSelected && styles.templateLabelSelected,
                    ]}
                  >
                    {template.title}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.fieldLabel}>Nome do checklist</Text>
        <Input
          placeholder="Ex.: Vistoria de entrega"
          value={form.title}
          onChangeValue={(value) => form.setTitle(String(value))}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.fieldLabel}>Tags do checklist</Text>
        <TagMultiSelect
          selectedIds={form.tagsIds}
          availableTags={activeTags}
          allTagsById={tagsById}
          onChange={form.setTagsIds}
          onCreateTag={createTag}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.fieldLabel}>Opções de resposta</Text>
        <View style={styles.optionsRow}>
          {form.options.map((option, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: options are positional and have no stable id before saving
            <View key={index} style={styles.optionPill}>
              <Pressable
                hitSlop={8}
                onPress={() =>
                  form.updateOptionSemantic(
                    index,
                    NEXT_SEMANTIC[option.semantic],
                  )
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
                onPress={() => setPendingDelete({ type: 'option', index })}
              >
                <Icon name="multiply" size={12} color={colors.gray[400]} />
              </Pressable>
            </View>
          ))}
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.addOptionButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={form.addOption}
        >
          <Icon name="plus" size={12} color={colors.blue.base} />
          <Text style={styles.addOptionText}>
            Adicionar opção (ex: Não aplica)
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <View style={styles.itemsHeader}>
          <Text style={styles.fieldLabel}>Itens do checklist</Text>
          <Text style={styles.itemsCount}>{form.items.length} itens</Text>
        </View>
        <View style={styles.itemsList}>
          {form.items.map((item, index) => (
            <View key={item.key} style={styles.itemRow}>
              <View style={styles.itemNum}>
                <Text style={styles.itemNumText}>{index + 1}</Text>
              </View>
              <View style={styles.itemCol}>
                <TextInput
                  style={styles.itemTitleInput}
                  value={item.title}
                  onChangeText={(value) =>
                    form.updateItem(item.key, { title: value })
                  }
                  placeholder="Título do item"
                  placeholderTextColor={colors.gray[400]}
                />
                <TextInput
                  style={styles.itemDescriptionInput}
                  value={item.description}
                  onChangeText={(value) =>
                    form.updateItem(item.key, { description: value })
                  }
                  placeholder="Descrição (opcional)"
                  placeholderTextColor={colors.gray[400]}
                  multiline
                />
                <TagMultiSelect
                  selectedIds={item.tagsIds}
                  availableTags={activeTags}
                  allTagsById={tagsById}
                  onChange={(ids) =>
                    form.updateItem(item.key, { tagsIds: ids })
                  }
                  onCreateTag={createTag}
                  placeholder="Responsável padrão (opcional)"
                />
              </View>
              {form.items.length > 1 && (
                <Pressable
                  style={({ pressed }) => pressed && { opacity: 0.7 }}
                  onPress={() =>
                    setPendingDelete({ type: 'item', key: item.key })
                  }
                >
                  <Icon name="trash-2" size={16} color={colors.gray[400]} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.addItemButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={form.addItem}
        >
          <Icon name="plus" size={14} color={colors.ink.base} />
          <Text style={styles.addItemButtonText}>Adicionar item</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <ConfirmBottomSheet
        visible={Boolean(pendingDelete)}
        title={
          pendingDelete?.type === 'option' ? 'Remover opção' : 'Remover item'
        }
        message={
          pendingDelete?.type === 'option'
            ? 'Deseja remover esta opção de resposta?'
            : 'Deseja remover este item do checklist?'
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete?.type === 'option') {
            form.removeOption(pendingDelete.index)
          } else if (pendingDelete?.type === 'item') {
            form.removeItem(pendingDelete.key)
          }
          setPendingDelete(null)
        }}
      />
    </View>
  )
}
