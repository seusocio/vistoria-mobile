import { BottomSheetView } from '@gorhom/bottom-sheet'
import { Text, View } from 'react-native'
import { AppBottomSheet, Form } from '@/components'
import { useSheetFooterActions } from '@/components/SheetFooterActions'
import type { ApplicationFillContainer } from '../application-fill.container'
import { styles } from '../application-fill.styles'

/** "Adicionar item": an ad-hoc item, outside the checklist template. */
export function AddItemSheet({ c }: { c: ApplicationFillContainer }) {
  const renderFooter = useSheetFooterActions({
    confirmLabel: 'Adicionar',
    onConfirm: c.onSaveNewItem,
  })

  return (
    <AppBottomSheet visible={c.addingItem} onClose={c.onCloseAddItem} snapPoints={['95%']} footerComponent={renderFooter}>
      <BottomSheetView style={styles.sheetContent}>
        <View style={styles.modalField}>
          <Text style={styles.modalFieldLabel}>Título do item</Text>
          <Form.TextField control={c.newItemForm.control} name="title" placeholder="Ex.: Base de shaft 5" />
        </View>

        <View style={styles.modalField}>
          <Text style={styles.modalFieldLabel}>Tags do item</Text>
          <Form.TagSelect
            control={c.newItemForm.control}
            name="tagsIds"
            availableTags={c.tagsCatalog.activeTags}
            allTagsById={c.tagsCatalog.tagsById}
            onCreateTag={c.tagsCatalog.createTag}
          />
        </View>

        <Form.ErrorText message={c.newItemForm.formState.errors.root?.message} />
      </BottomSheetView>
    </AppBottomSheet>
  )
}
