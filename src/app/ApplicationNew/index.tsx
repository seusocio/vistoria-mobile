import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from 'convex-helpers/react/cache'
import { useForm } from 'react-hook-form'
import { Alert, Pressable, Text, View } from 'react-native'
import { Form, Screen } from '@/components'
import { Icon } from '@/components/Icon'
import { useApplicationMutations } from '@/hooks/useApplicationMutations'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { Checklist } from '@/infra/domain/entities'
import {
  ApplicationMetaFormValues,
  applicationMetaSchema,
} from '@/infra/domain/schemas'
import { buildApplication } from '@/infra/services'
import type { StackRoutesProps } from '@/routes/types'
import { colors } from '@/styles'
import { todayIso } from '@/utils/date'
import { api } from '../../../convex/_generated/api'
import { styles } from './styles'

export function ApplicationNew({
  navigation,
  route,
}: StackRoutesProps<'applicationNew'>) {
  const { checklistId } = route.params
  const checklistData = useQuery(api.checklists.findById, {
    id: checklistId,
  }) as Checklist | null | undefined
  const checklist = checklistData ?? null
  const loading = checklistData === undefined
  const tagsCatalog = useTagsCatalog()
  const mutations = useApplicationMutations()
  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<ApplicationMetaFormValues>({
    resolver: zodResolver(applicationMetaSchema),
    defaultValues: { tagsIds: [], date: todayIso() },
  })
  const tagsIds = watch('tagsIds')

  function onSubmit(values: ApplicationMetaFormValues) {
    if (!checklist) return
    const application = buildApplication(
      { checklistId, tagsIds: values.tagsIds, date: values.date },
      checklist,
    )
    void mutations.create({ entity: application }).catch(() => {
      navigation.goBack()
      Alert.alert('Erro', 'Não foi possível criar a aplicação')
    })
    navigation.replace('applicationFill', {
      checklistId,
      applicationId: application.id,
    })
  }

  return (
    <Screen
      loading={loading || !checklist}
      variant="nested"
      navTitleTone="muted"
      onBack={() => navigation.goBack()}
      title={checklist?.title}
      footer={
        checklist ? (
          <Pressable
            style={({ pressed }) => [
              styles.startButton,
              tagsIds.length === 0 && styles.startButtonDisabled,
              pressed && { opacity: 0.7 },
            ]}
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting || tagsIds.length === 0}
          >
            <Text style={styles.startButtonText}>
              {isSubmitting ? 'Iniciando...' : 'Iniciar preenchimento'}
            </Text>
            <Icon name="chevron-right" size={18} color={colors.white} />
          </Pressable>
        ) : undefined
      }
    >
      {checklist && (
        <>
          <Text style={styles.title}>Nova aplicação</Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Tags da aplicação</Text>
            <Form.TagSelect
              control={control}
              name="tagsIds"
              availableTags={tagsCatalog.activeTags}
              allTagsById={tagsCatalog.tagsById}
              onCreateTag={tagsCatalog.createTag}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Data da visita</Text>
            <Form.DateField
              control={control}
              name="date"
              accessibilityLabel="Selecionar data da nova visita"
            />
          </View>

          <View style={styles.helperRow}>
            <Icon name="clipboard-check" size={14} color={colors.gray[400]} />
            <Text style={styles.helperText}>
              Os {checklist.items.length} itens do modelo serão copiados para
              esta visita
            </Text>
          </View>
        </>
      )}
    </Screen>
  )
}
