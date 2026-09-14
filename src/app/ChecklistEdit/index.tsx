import { useEffect, useState } from 'react'
import { Pressable, Text } from 'react-native'
import { Screen } from '@/components'
import { Icon } from '@/components/Icon'
import { Checklist } from '@/infra/domain/entities'
import { useChecklistForm } from '@/hooks/useChecklistForm'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { StackRoutesProps } from '@/routes/types'
import { getChecklist, updateChecklist } from '@/infra/services'
import { colors } from '@/styles'
import { ChecklistFormView } from '../ChecklistForm/ChecklistFormView'
import { styles } from '../ChecklistNew/styles'

function ChecklistEditForm({
  checklist,
  navigation,
}: {
  checklist: Checklist
  navigation: StackRoutesProps<'checklistEdit'>['navigation']
}) {
  const form = useChecklistForm(checklist)
  const tagsCatalog = useTagsCatalog()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      await updateChecklist(checklist.id, {
        title: form.title,
        tagsIds: form.tagsIds,
        options: form.options,
        items: form.items.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          tagsIds: item.tagsIds,
        })),
      })
      navigation.navigate('checklistDetail', { checklistId: checklist.id })
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
      title="Editar checklist"
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
            {submitting ? 'Salvando...' : 'Salvar alterações'}
          </Text>
        </Pressable>
      }
    >
      <ChecklistFormView form={form} tagsCatalog={tagsCatalog} error={error} />
    </Screen>
  )
}

export function ChecklistEdit({
  navigation,
  route,
}: StackRoutesProps<'checklistEdit'>) {
  const { checklistId } = route.params
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getChecklist(checklistId)
      .then(setChecklist)
      .finally(() => setLoading(false))
  }, [checklistId])

  if (loading || !checklist) {
    return (
      <Screen
        loading
        variant="nested"
        navTitleTone="strong"
        onBack={() => navigation.goBack()}
        title="Editar checklist"
      >
        <></>
      </Screen>
    )
  }

  return <ChecklistEditForm checklist={checklist} navigation={navigation} />
}
