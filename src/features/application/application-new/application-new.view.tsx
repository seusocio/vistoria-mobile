import { Pressable, Text, View } from 'react-native'
import { Form, Screen } from '@/components'
import { Icon } from '@/components/Icon'
import { colors } from '@/styles'
import {
  useApplicationNewContainer,
  type UseApplicationNewContainerProps,
} from './application-new.container'
import { styles } from './application-new.styles'

export function ApplicationNewView(props: UseApplicationNewContainerProps) {
  const c = useApplicationNewContainer(props)

  return (
    <Screen
      loading={c.loading}
      variant="nested"
      navTitleTone="muted"
      onBack={c.onBack}
      title={c.checklist?.title}
      footer={
        c.checklist ? (
          <Pressable
            style={({ pressed }) => [
              styles.startButton,
              c.tagsIds.length === 0 && styles.startButtonDisabled,
              pressed && { opacity: 0.7 },
            ]}
            onPress={c.onStart}
            disabled={c.isSubmitting || c.tagsIds.length === 0}
          >
            <Text style={styles.startButtonText}>
              {c.isSubmitting ? 'Iniciando...' : 'Iniciar preenchimento'}
            </Text>
            <Icon name="chevron-right" size={18} color={colors.white} />
          </Pressable>
        ) : undefined
      }
    >
      {c.checklist && (
        <>
          <Text style={styles.title}>Nova aplicação</Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Tags da aplicação</Text>
            <Form.TagSelect
              control={c.control}
              name="tagsIds"
              availableTags={c.tagsCatalog.activeTags}
              allTagsById={c.tagsCatalog.tagsById}
              onCreateTag={c.tagsCatalog.createTag}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Data da visita</Text>
            <Form.DateField
              control={c.control}
              name="date"
              accessibilityLabel="Selecionar data da nova visita"
            />
          </View>

          <View style={styles.helperRow}>
            <Icon name="clipboard-check" size={14} color={colors.gray[400]} />
            <Text style={styles.helperText}>
              Os {c.checklist.items.length} itens do modelo serão copiados para
              esta visita
            </Text>
          </View>
        </>
      )}
    </Screen>
  )
}
