import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { colors, fontFamily, space } from '@/styles'
import type { CollapsingHeader } from '../use-collapsing-header'
import type { VisitaTab } from '../use-note-composer'

const TABS: readonly VisitaTab[] = ['atividade', 'fotos', 'pendencias']

export interface VisitaTabsProps {
  header: CollapsingHeader
  tab: VisitaTab
  onChange: (tab: VisitaTab) => void
  photoCount: number
}

/** Pinned under the top bar once scrolled to it (see `tabsStyle`). */
export function VisitaTabs({ header, tab, onChange, photoCount }: VisitaTabsProps) {
  return (
    <Animated.View
      style={[s.tabs, header.tabsStyle]}
      onLayout={(e) => {
        header.tabsY.value = e.nativeEvent.layout.y
      }}
    >
      {TABS.map((t) => (
        <Pressable key={t} style={s.tab} onPress={() => onChange(t)}>
          <Text style={[s.tabText, tab === t && s.tabTextActive]}>
            {t === 'atividade' ? 'Atividade' : t === 'fotos' ? `Fotos · ${photoCount}` : 'Pendências'}
          </Text>
          {tab === t && <View style={s.tabIndicator} />}
        </Pressable>
      ))}
    </Animated.View>
  )
}

const s = StyleSheet.create({
  tabs: {
    zIndex: 10,
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    paddingHorizontal: space.lg,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: space.md },
  tabText: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.gray[600],
  },
  tabTextActive: { fontFamily: fontFamily.bold, color: colors.blue.base },
  tabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: space.sm,
    right: space.sm,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.blue.base,
  },
})
