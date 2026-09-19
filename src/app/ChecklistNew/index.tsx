import { useState } from 'react'
import { Pressable, Text } from 'react-native'
import { ScrollViewContainer } from 'react-native-reorderable-list'
import { ConfirmBottomSheet, Screen } from '@/components'
import { Icon } from '@/components/Icon'
import { useChecklistForm } from '@/hooks/useChecklistForm'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { ChecklistTemplate, checklistTemplates } from '@/infra/data/templates'
import { ChecklistFormValues } from '@/infra/domain/schemas'
import { createChecklist } from '@/infra/services'
import { StackRoutesProps } from '@/routes/types'
import { colors } from '@/styles'
import { ChecklistFormView } from '../ChecklistForm/ChecklistFormView'
import { styles } from './styles'

export function ChecklistNew({ navigation }: StackRoutesProps<'checklistNew'>) {
  const checklistForm = useChecklistForm()
  const { form, applyTemplate } = checklistForm
  const tagsCatalog = useTagsCatalog()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  )
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const unsavedGuard = useUnsavedChangesGuard(
    form.formState.isDirty,
    navigation,
  )

  async function handleSelectTemplate(template: ChecklistTemplate) {
    if (loadingTemplateId) return
    setLoadingTemplateId(template.id)
    setError(null)
    try {
      const tags = await Promise.all(
        template.tagLabels.map((label) => tagsCatalog.createTag(label)),
      )
      applyTemplate({
        title: template.title,
        tagsIds: tags.map((tag) => tag.id),
        options: template.options,
        itemTitles: template.itemTitles,
      })
      setSelectedTemplateId(template.id)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível aplicar o modelo',
      )
    } finally {
      setLoadingTemplateId(null)
    }
  }

  async function onSubmit(values: ChecklistFormValues) {
    setError(null)
    try {
      const checklist = await createChecklist(values)
      form.reset(values)
      navigation.replace('checklistDetail', { checklistId: checklist.id })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar o checklist',
      )
    }
  }

  return (
    <Screen
      ScrollComponent={ScrollViewContainer}
      variant="nested"
      navTitleTone="strong"
      onBack={() => navigation.goBack()}
      title="Novo checklist"
      footer={
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={form.handleSubmit(onSubmit)}
          disabled={form.formState.isSubmitting}
        >
          <Icon name="check" size={18} color={colors.white} />
          <Text style={styles.saveButtonText}>
            {form.formState.isSubmitting ? 'Salvando...' : 'Criar checklist'}
          </Text>
        </Pressable>
      }
    >
      <ChecklistFormView
        form={checklistForm}
        tagsCatalog={tagsCatalog}
        templates={checklistTemplates}
        selectedTemplateId={selectedTemplateId}
        loadingTemplateId={loadingTemplateId}
        onSelectTemplate={handleSelectTemplate}
        error={error}
      />
      <ConfirmBottomSheet
      snapPoints={['25%']}
        visible={unsavedGuard.visible}
        title="Descartar alterações?"
        message="Suas alterações não salvas serão perdidas."
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        onCancel={unsavedGuard.onCancel}
        onConfirm={unsavedGuard.onConfirm}
      />
    </Screen>
  )
}
