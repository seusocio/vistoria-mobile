import {
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet'
import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import {
  AppBottomSheet,
  ConfirmBottomSheet,
  Input,
  TagChip,
  TagMultiSelect,
} from '@/components'
import { Icon, IconName } from '@/components/Icon'
import {
  ChecklistFormApi,
  ChecklistFormItemState,
} from '@/hooks/useChecklistForm'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { ChecklistTemplate } from '@/infra/data/templates'
import { ResponseSemantic } from '@/infra/domain/entities'
import { colors } from '@/styles'
import { haptics } from '@/utils/haptics'
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
  loadingTemplateId?: string | null
  onSelectTemplate?: (template: ChecklistTemplate) => void
  error?: string | null
}
export function ChecklistFormView({
  form,
  tagsCatalog,
  templates,
  selectedTemplateId,
  loadingTemplateId,
  onSelectTemplate,
  error,
}: ChecklistFormViewProps) {
  const { activeTags, tagsById, createTag, resolveLabels } = tagsCatalog
  const [pendingDelete, setPendingDelete] = useState<
    { type: 'option'; index: number } | { type: 'item'; key: string } | null
  >(null)
  const [itemSheet, setItemSheet] = useState<
    { mode: 'new' } | { mode: 'edit'; key: string } | null
  >(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftTagsIds, setDraftTagsIds] = useState<string[]>([])
  const [itemError, setItemError] = useState<string | null>(null)

  function openAddItem() {
    setDraftTitle('')
    setDraftDescription('')
    setDraftTagsIds([])
    setItemError(null)
    setItemSheet({ mode: 'new' })
  }

  function openEditItem(item: ChecklistFormItemState) {
    setDraftTitle(item.title)
    setDraftDescription(item.description)
    setDraftTagsIds(item.tagsIds)
    setItemError(null)
    setItemSheet({ mode: 'edit', key: item.key })
  }

  function handleSaveItem() {
    if (!draftTitle.trim()) {
      haptics.error()
      setItemError('Informe um título para o item')
      return
    }
    const values = {
      title: draftTitle.trim(),
      description: draftDescription.trim(),
      tagsIds: draftTagsIds,
    }
    if (itemSheet?.mode === 'edit') {
      form.updateItem(itemSheet.key, values)
    } else {
      form.addItem(values)
    }
    setItemSheet(null)
  }

  function renderItemSheetFooter(props: BottomSheetFooterProps) {
    return (
      <BottomSheetFooter {...props} style={styles.sheetFooter}>
        <Pressable
          style={({ pressed }) => [
            styles.sheetSaveButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleSaveItem}
        >
          <Icon name="check" size={16} color={colors.white} />
          <Text style={styles.sheetSaveButtonText}>
            {itemSheet?.mode === 'edit' ? 'Salvar' : 'Adicionar'}
          </Text>
        </Pressable>
      </BottomSheetFooter>
    )
  }

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
                  disabled={Boolean(loadingTemplateId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Aplicar modelo ${template.title}`}
                  accessibilityState={{
                    selected: isSelected,
                    disabled: Boolean(loadingTemplateId),
                  }}
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
                    {loadingTemplateId === template.id
                      ? 'Aplicando...'
                      : template.title}
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
                hitSlop={12}
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
        {form.items.length > 0 && (
          <View style={styles.itemsList}>
            {form.items.map((item, index) => {
              const labels = resolveLabels(item.tagsIds)
              return (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [
                    styles.itemCard,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => openEditItem(item)}
                  accessibilityLabel={`Editar item ${index + 1}`}
                >
                  <View style={styles.itemNum}>
                    <Text style={styles.itemNumText}>{index + 1}</Text>
                  </View>
                  <View style={styles.itemCardBody}>
                    <Text
                      style={[
                        styles.itemCardTitle,
                        !item.title && styles.itemCardPlaceholder,
                      ]}
                      numberOfLines={1}
                    >
                      {item.title || 'Item sem título'}
                    </Text>
                    {item.description ? (
                      <Text
                        style={styles.itemCardDescription}
                        numberOfLines={1}
                      >
                        {item.description}
                      </Text>
                    ) : null}
                    {labels.length > 0 && (
                      <View style={styles.itemCardTags}>
                        {labels.map((label) => (
                          <TagChip key={label} label={label} tone="neutral" />
                        ))}
                      </View>
                    )}
                  </View>
                  <Pressable
                    style={({ pressed }) => pressed && { opacity: 0.7 }}
                    hitSlop={14}
                    onPress={() =>
                      setPendingDelete({ type: 'item', key: item.key })
                    }
                    accessibilityLabel={`Remover item ${index + 1}`}
                  >
                    <Icon name="trash-2" size={16} color={colors.gray[400]} />
                  </Pressable>
                </Pressable>
              )
            })}
          </View>
        )}
        <Pressable
          style={({ pressed }) => [
            styles.addItemButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={openAddItem}
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
        confirmLabel={
          pendingDelete?.type === 'option' ? 'Remover opção' : 'Remover item'
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
      <AppBottomSheet
        visible={Boolean(itemSheet)}
        onClose={() => setItemSheet(null)}
        snapPoints={['90%']}
        footerComponent={renderItemSheetFooter}
      >
        <BottomSheetView style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>
            {itemSheet?.mode === 'edit' ? 'Editar item' : 'Novo item'}
          </Text>
          <View style={styles.sheetField}>
            <Text style={styles.fieldLabel}>Título do item</Text>
            <BottomSheetTextInput
              autoFocus
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="Ex.: Pintura das paredes"
              placeholderTextColor={colors.gray[400]}
              style={styles.sheetInput}
            />
          </View>
          <View style={styles.sheetField}>
            <Text style={styles.fieldLabel}>Descrição (opcional)</Text>
            <BottomSheetTextInput
              value={draftDescription}
              onChangeText={setDraftDescription}
              placeholder="Detalhe o que deve ser verificado"
              placeholderTextColor={colors.gray[400]}
              style={[styles.sheetInput, styles.sheetTextarea]}
              multiline
            />
          </View>
          <View style={styles.sheetField}>
            <Text style={styles.fieldLabel}>Tags do item</Text>
            <TagMultiSelect
              selectedIds={draftTagsIds}
              availableTags={activeTags}
              allTagsById={tagsById}
              onChange={setDraftTagsIds}
              onCreateTag={createTag}
              placeholder="Responsável padrão (opcional)"
              variant="muted"
            />
          </View>
          {itemError ? <Text style={styles.error}>{itemError}</Text> : null}
        </BottomSheetView>
      </AppBottomSheet>
    </View>
  )
}
