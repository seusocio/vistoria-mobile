import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ProgressBar } from '@/components'
import { Icon } from '@/components/Icon'
import { colors, space } from '@/styles'
import type { ApplicationFillContainer } from '../../application-fill/application-fill.container'
import { styles as fillStyles } from '../../application-fill/application-fill.styles'
import { ApplicationItemGroups } from '../../application-fill/components/ApplicationItemGroups'
import { DERIVED_STATE_LABEL } from '../../application-fill/derived-state-label'

/** The Pendências tab: the checklist's items, as the legacy fill view lists them. */
export function PendenciasTab({ c }: { c: ApplicationFillContainer }) {
  return (
    <View style={s.pendencias}>
      <View style={s.pendHeader}>
        <View style={fillStyles.progressCol}>
          <Text style={fillStyles.progressText}>
            {c.progress.done}/{c.progress.total} concluídos · {DERIVED_STATE_LABEL[c.derivedState]}
          </Text>
          <ProgressBar progress={c.progress.total > 0 ? c.progress.done / c.progress.total : 0} />
        </View>
        <View style={fillStyles.itemsHeaderRow}>
          <Text style={fillStyles.itemsTitle}>Itens do checklist</Text>
          <Pressable
            style={({ pressed }) => [fillStyles.addItemButton, pressed && { opacity: 0.7 }]}
            onPress={c.onOpenAddItem}
          >
            <Icon name="plus" size={14} color={colors.blue.base} />
            <Text style={fillStyles.addItemButtonText}>Adicionar item</Text>
          </Pressable>
        </View>
      </View>
      <ApplicationItemGroups c={c} />
    </View>
  )
}

const s = StyleSheet.create({
  pendencias: { paddingTop: space.lg },
  pendHeader: { paddingHorizontal: 20, gap: space.lg, marginBottom: space.sm },
})
