import { BottomSheetView } from '@gorhom/bottom-sheet'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { AppBottomSheet, Form } from '@/components'
import { Icon } from '@/components/Icon'
import { useSheetFooterActions } from '@/components/SheetFooterActions'
import { colors, fontFamily, space } from '@/styles'
import type { ApplicationFillContainer } from '../application-fill.container'
import { styles } from '../application-fill.styles'

export interface EditApplicationSheetProps {
  c: ApplicationFillContainer
  /** Adds an "Excluir aplicação" row at the bottom. The legacy fill view deletes from its header instead. */
  onDelete?: () => void
}

/** The visit's own tags and date. */
export function EditApplicationSheet({ c, onDelete }: EditApplicationSheetProps) {
  const renderFooter = useSheetFooterActions({
    confirmLabel: 'Salvar',
    onConfirm: c.onSaveApplication,
  })

  return (
    <AppBottomSheet
      visible={c.editingApplication}
      onClose={c.onCloseEditApplication}
      snapPoints={['95%']}
      footerComponent={renderFooter}
    >
      <BottomSheetView style={styles.sheetContent}>
        <View style={styles.modalField}>
          <Text style={styles.modalFieldLabel}>Tags da aplicação</Text>
          <Form.TagSelect
            control={c.metaForm.control}
            name="tagsIds"
            availableTags={c.tagsCatalog.activeTags}
            allTagsById={c.tagsCatalog.tagsById}
            onCreateTag={c.tagsCatalog.createTag}
          />
          <Form.ErrorText message={c.metaForm.formState.errors.tagsIds?.message} />
        </View>

        <View style={styles.modalField}>
          <Text style={styles.modalFieldLabel}>Data da visita</Text>
          <Form.DateField control={c.metaForm.control} name="date" />
        </View>

        {c.applicationError ? <Text style={styles.modalError}>{c.applicationError}</Text> : null}

        {onDelete ? (
          <Pressable style={({ pressed }) => [local.deleteRow, pressed && { opacity: 0.7 }]} onPress={onDelete}>
            <Icon name="trash-2" size={16} color={colors.danger.base} />
            <Text style={local.deleteText}>Excluir aplicação</Text>
          </Pressable>
        ) : null}
      </BottomSheetView>
    </AppBottomSheet>
  )
}

const local = StyleSheet.create({
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
  },
  deleteText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.danger.base,
  },
})
