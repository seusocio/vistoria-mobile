import { useQuery } from 'convex-helpers/react/cache'
import { useEffect, useRef, useState } from 'react'
import { Pressable, Text } from 'react-native'
import { ScrollViewContainer } from 'react-native-reorderable-list'
import { ConfirmBottomSheet, Screen } from '@/components'
import { Icon } from '@/components/Icon'
import { checklistToFormValues, useChecklistForm } from '@/hooks/useChecklistForm'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import type { Checklist } from '@/infra/domain/entities'
import { ChecklistFormValues } from '@/infra/domain/schemas'
import { updateChecklist } from '@/infra/services'
import type { StackRoutesProps } from '@/routes/types'
import { colors } from '@/styles'
import { api } from '../../../convex/_generated/api'
import { ChecklistFormView } from '../ChecklistForm/ChecklistFormView'
import { styles } from '../ChecklistNew/styles'

export function ChecklistEdit({
  navigation,
  route,
}: StackRoutesProps<'checklistEdit'>) {
  const { checklistId } = route.params
  const checklistData = useQuery(api.checklists.findById, {
    id: checklistId,
  }) as Checklist | null | undefined
  const loading = checklistData === undefined
  const checklistForm = useChecklistForm()
  const { form } = checklistForm
  const tagsCatalog = useTagsCatalog()
  const [error, setError] = useState<string | null>(null)
  const unsavedGuard = useUnsavedChangesGuard(
    form.formState.isDirty,
    navigation,
  )
  const hydrated = useRef(false)

  useEffect(() => {
    if (checklistData && !hydrated.current) {
      form.reset(checklistToFormValues(checklistData))
      hydrated.current = true
    }
  }, [checklistData, form])

  async function onSubmit(values: ChecklistFormValues) {
    setError(null)
    try {
      await updateChecklist(checklistId, values)
      form.reset(values)
      navigation.navigate('checklistDetail', { checklistId })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar o checklist',
      )
    }
  }

  if (loading || !checklistData) {
    return (
      <Screen
        loading
        variant="nested"
        navTitleTone="strong"
        onBack={() => navigation.goBack()}
        title="Editar checklist"
      />
    )
  }

  return (
    <Screen
      ScrollComponent={ScrollViewContainer}
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
          onPress={form.handleSubmit(onSubmit)}
          disabled={form.formState.isSubmitting}
        >
          <Icon name="check" size={18} color={colors.white} />
          <Text style={styles.saveButtonText}>
            {form.formState.isSubmitting ? 'Salvando...' : 'Salvar alterações'}
          </Text>
        </Pressable>
      }
    >
      <ChecklistFormView form={checklistForm} tagsCatalog={tagsCatalog} error={error} />
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
