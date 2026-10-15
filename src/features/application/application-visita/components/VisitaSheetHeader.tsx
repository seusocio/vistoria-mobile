import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { Badge, TagChipList } from '@/components'
import { Icon } from '@/components/Icon'
import { colors, fontFamily, radius, space, textStyles } from '@/styles'
import { presentApplicationCompletionPicker } from '../../application-fill/application-completion-picker'
import type { ApplicationFillContainer } from '../../application-fill/application-fill.container'
import { styles as fillStyles } from '../../application-fill/application-fill.styles'
import { OVERLAP, type CollapsingHeader } from '../use-collapsing-header'
import { fmtDate, initials } from '../visita-format'

/** The white sheet over the banner: avatar, editar/concluir, name, date, status and tags. */
export function VisitaSheetHeader({ c, header }: { c: ApplicationFillContainer; header: CollapsingHeader }) {
  const app = c.application
  const visitAt = app.date || app.createdAt

  return (
    <View style={[s.sheetHeader, { marginTop: header.bannerHeight - OVERLAP }]}>
      <View style={s.avatarRow}>
        <Animated.View style={[s.avatar, header.avatarStyle]}>
          <Text style={s.avatarText}>{initials(c.checklist.title)}</Text>
        </Animated.View>
        <View style={s.headerActions}>
          <Pressable
            style={({ pressed }) => [s.pillButton, pressed && { opacity: 0.7 }]}
            onPress={c.onEditApplication}
          >
            <Icon name="edit-pen" size={13} color={colors.ink.base} />
            <Text style={s.pillButtonText}>Editar</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.pillButton, s.pillButtonPrimary, pressed && { opacity: 0.85 }]}
            onPress={() =>
              presentApplicationCompletionPicker((action) =>
                action === 'draft' ? c.onSaveDraft() : c.onComplete(),
              )
            }
          >
            <Icon name="check" size={13} color={colors.white} />
            <Text style={[s.pillButtonText, { color: colors.white }]}>Concluir</Text>
          </Pressable>
        </View>
      </View>
      <Text
        style={s.name}
        numberOfLines={2}
        onLayout={(e) => {
          header.nameY.value = header.bannerHeight - OVERLAP + e.nativeEvent.layout.y + e.nativeEvent.layout.height
        }}
      >
        {c.checklist.title}
      </Text>
      <View style={s.metaRow}>
        <View style={s.metaItem}>
          <Icon name="calendar" size={15} color={colors.gray[600]} />
          <Text style={s.metaText}>{fmtDate(visitAt)}</Text>
        </View>
      </View>
      <View style={s.tagsRow}>
        <Badge
          label={app.status === 'completed' ? 'Concluída' : 'Rascunho'}
          tone={app.status === 'completed' ? 'completed' : 'draft'}
        />
        <TagChipList labels={c.tagsCatalog.resolveLabels(app.tagsIds)} />
      </View>
      {c.applicationError ? <Text style={fillStyles.modalError}>{c.applicationError}</Text> : null}
    </View>
  )
}

const s = StyleSheet.create({
  sheetHeader: {
    zIndex: 1,
    paddingHorizontal: 20,
    paddingBottom: space.md,
    backgroundColor: colors.white,
    borderCurve: 'continuous',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginTop: -36,
    borderWidth: 3,
    borderColor: colors.white,
    backgroundColor: colors.blue.tint,
    alignItems: 'center',
    justifyContent: 'center',
    transformOrigin: 'left bottom',
  },
  avatarText: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.blue.base,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerActions: { flexDirection: 'row', gap: space.sm, paddingTop: space.md },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  pillButtonPrimary: {
    backgroundColor: colors.blue.base,
    borderColor: colors.blue.base,
  },
  pillButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.ink.base,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  name: { ...textStyles.screenTitle, fontSize: 20, marginTop: space.sm },
  metaRow: { flexDirection: 'row', gap: space.lg, marginTop: space.sm },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  metaText: { ...textStyles.body, flexShrink: 1 },
})
