// PROTOTYPE — throwaway variant switcher. Never ships: renders nothing outside __DEV__.
import { useEffect } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

interface PrototypeSwitcherProps {
  variants: { key: string; name: string }[]
  current: string
  onChange: (key: string) => void
}

export function PrototypeSwitcher({ variants, current, onChange }: PrototypeSwitcherProps) {
  const index = Math.max(0, variants.findIndex((v) => v.key === current))
  const go = (delta: number) => onChange(variants[(index + delta + variants.length) % variants.length].key)

  useEffect(() => {
    if (Platform.OS !== 'web' || !__DEV__) return
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!__DEV__) return null
  const v = variants[index]
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.pill}>
        <Pressable hitSlop={8} onPress={() => go(-1)}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={styles.label}>
          {v.key} ({v.name})
        </Text>
        <Pressable hitSlop={8} onPress={() => go(1)}>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center', zIndex: 9999 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FF2D87',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  arrow: { color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 22 },
  label: { color: '#fff', fontSize: 13, fontWeight: '700' },
})
