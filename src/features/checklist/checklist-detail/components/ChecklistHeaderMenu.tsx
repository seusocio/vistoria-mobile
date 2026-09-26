import { MenuView, type NativeActionEvent } from '@expo/ui/community/menu'
import { View } from 'react-native'
import { Icon } from '@/components/Icon'
import type { HistoryLayout } from '@/lib/preferences'
import { colors } from '@/styles'
import { styles } from '../checklist-detail.styles'

type MenuActionId = 'layout-detailed' | 'layout-dense' | 'edit' | 'duplicate' | 'delete'

interface ChecklistHeaderMenuProps {
  historyLayout: HistoryLayout
  onToggleHistoryLayout: () => void
  onEditChecklist: () => void
  onDuplicate: () => void
  onAskDelete: () => void
}

/**
 * Native OS menu (UIMenu on iOS, Compose DropdownMenu on Android) anchored
 * to the header's kebab button - replaces what used to be three separate
 * header icons plus the histórico detalhado/denso toggle. Layout is binary,
 * so picking the non-active option is just a toggle: there's no separate
 * "set layout" action to wire up.
 */
export function ChecklistHeaderMenu({
  historyLayout,
  onToggleHistoryLayout,
  onEditChecklist,
  onDuplicate,
  onAskDelete,
}: ChecklistHeaderMenuProps) {
  function handlePressAction({ nativeEvent }: NativeActionEvent) {
    switch (nativeEvent.event as MenuActionId) {
      case 'layout-detailed':
        if (historyLayout !== 'detailed') onToggleHistoryLayout()
        return
      case 'layout-dense':
        if (historyLayout !== 'dense') onToggleHistoryLayout()
        return
      case 'edit':
        onEditChecklist()
        return
      case 'duplicate':
        onDuplicate()
        return
      case 'delete':
        onAskDelete()
    }
  }

  return (
    <MenuView
      onPressAction={handlePressAction}
      actions={[
        {
          id: 'layout-section',
          title: 'Exibição do histórico',
          displayInline: true,
          subactions: [
            {
              id: 'layout-detailed',
              title: 'Detalhado',
              state: historyLayout === 'detailed' ? 'on' : 'off',
            },
            {
              id: 'layout-dense',
              title: 'Denso',
              state: historyLayout === 'dense' ? 'on' : 'off',
            },
          ],
        },
        {
          id: 'edit-section',
          title: '',
          displayInline: true,
          subactions: [
            { id: 'edit', title: 'Editar checklist' },
            { id: 'duplicate', title: 'Duplicar checklist' },
          ],
        },
        {
          id: 'delete-section',
          title: '',
          displayInline: true,
          subactions: [
            { id: 'delete', title: 'Excluir checklist', attributes: { destructive: true } },
          ],
        },
      ]}
    >
      <View
        style={styles.headerActionButton}
        accessibilityRole="button"
        accessibilityLabel="Mais opções do checklist"
      >
        <Icon name="more-vertical" size={16} color={colors.ink.base} />
      </View>
    </MenuView>
  )
}
