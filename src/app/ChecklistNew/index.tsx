import { useState } from 'react'
import { Pressable, Text } from 'react-native'
import { Screen } from '@/components'
import { Icon } from '@/components/Icon'
import { ChecklistTemplate, checklistTemplates } from '@/infra/data/templates'
import { useChecklistForm } from '@/hooks/useChecklistForm'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { StackRoutesProps } from '@/routes/types'
import { createChecklist } from '@/infra/services'
import { colors } from '@/styles'
import { ChecklistFormView } from '../ChecklistForm/ChecklistFormView'
import { styles } from './styles'

export function ChecklistNew({ navigation }: StackRoutesProps<'checklistNew'>) {
  const form = useChecklistForm()
  const tagsCatalog = useTagsCatalog()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSelectTemplate(template: ChecklistTemplate) {
    setSelectedTemplateId(template.id)
    const tags = await Promise.all(
      template.tagLabels.map((label) => tagsCatalog.createTag(label)),
    )
    form.applyTemplate({
      title: template.title,
      tagsIds: tags.map((tag) => tag.id),
      options: template.options,
      itemTitles: template.itemTitles,
    })
  }

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      const checklist = await createChecklist({
        title: form.title,
        tagsIds: form.tagsIds,
        options: form.options,
        items: form.items.map((item) => ({
          title: item.title,
          description: item.description,
          tagsIds: item.tagsIds,
        })),
      })
      navigation.replace('checklistDetail', { checklistId: checklist.id })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar o checklist',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen
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
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Icon name="check" size={18} color={colors.white} />
          <Text style={styles.saveButtonText}>
            {submitting ? 'Salvando...' : 'Salvar checklist'}
          </Text>
        </Pressable>
      }
    >
      <ChecklistFormView
        form={form}
        tagsCatalog={tagsCatalog}
        templates={checklistTemplates}
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={handleSelectTemplate}
        error={error}
      />
    </Screen>
  )
}
