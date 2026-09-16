import { StyleSheet } from 'react-native'
import { colors, space } from '@/styles'

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink.base,
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  progressWrap: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    bottom: space.xxl,
  },
  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  counter: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
})
