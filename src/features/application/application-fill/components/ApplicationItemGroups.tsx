import { type StyleProp, View, type ViewStyle } from 'react-native'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import type { ApplicationFillContainer } from '../application-fill.container'
import { ApplicationItemGroupSection } from './ApplicationItemGroupSection'

/** Every accordion section of the checklist's items. */
export function ApplicationItemGroups({ c, style }: { c: ApplicationFillContainer; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      {c.groups.map((group) => (
        <ApplicationItemGroupSection
          key={group.key}
          title={group.title}
          groupItems={group.children}
          total={group.total}
          answered={group.answered}
          checklist={c.checklist}
          suggestionEnabled={FEATURE_FLAG.suggestion}
          resolveTagLabel={c.resolveTagLabel}
          onToggleComplete={c.onToggleComplete}
          onToggleGroupComplete={c.onToggleGroupComplete}
          onOpenDrawer={c.onOpenDrawer}
          onAcceptSuggestion={c.onAcceptSuggestion}
          onRejectSuggestion={c.onRejectSuggestion}
        />
      ))}
    </View>
  )
}
