import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { colors, fontFamily, space } from '@/styles'
import type { CollapsingHeader } from '../use-collapsing-header'

/* missing from the icon registry */
function ArrowLeftGlyph({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M19 12H5M12 19l-7-7 7-7"
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export interface VisitaTopBarProps {
  header: CollapsingHeader
  title: string
  onBack: () => void
}

/** Floats over the banner; turns solid, and shows the visit's name, once the banner scrolls away. */
export function VisitaTopBar({ header, title, onBack }: VisitaTopBarProps) {
  return (
    <View style={[s.topBar, { height: header.barHeight, paddingTop: header.topInset }]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, s.topBarBg, header.barBgStyle]} />
      <Pressable style={s.back} onPress={onBack} hitSlop={10} accessibilityLabel="Voltar">
        <ArrowLeftGlyph color={colors.white} />
      </Pressable>
      <View style={s.topTitleCol}>
        <Text style={s.topTitle}>Visita</Text>
        <Animated.Text style={[s.topSubtitle, header.barNameStyle]} numberOfLines={1}>
          {title}
        </Animated.Text>
      </View>
      <View style={{ width: 32 }} />
    </View>
  )
}

const s = StyleSheet.create({
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  topBarBg: { backgroundColor: colors.ink.base },
  back: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitleCol: { flex: 1, alignItems: 'center' },
  topTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.white },
  topSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.gray[400],
    maxWidth: '80%',
  },
})
