import { StyleSheet } from 'react-native'
import { colors, radius, space, touch } from '@/styles'

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink.base,
  },
  camera: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    backgroundColor: colors.ink.base,
  },
  topButton: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topButtonLabel: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  bottomBar: {
    backgroundColor: colors.ink.base,
    paddingTop: space.sm,
  },
  lensRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingBottom: space.sm,
  },
  lensPill: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  lensPillActive: {
    backgroundColor: colors.white,
  },
  lensPillText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  lensPillTextActive: {
    color: colors.ink.base,
  },
  filmstrip: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  filmstripSeparator: {
    width: space.sm,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingBottom: space.xl,
  },
  sideControl: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideControlLabel: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
    marginTop: space.xs,
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuterDisabled: {
    opacity: 0.4,
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.white,
  },
  completeButton: {
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.blue.base,
  },
  completeButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    gap: space.md,
    backgroundColor: colors.ink.base,
  },
  permissionTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionMessage: {
    color: colors.gray[400],
    fontSize: 14,
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.blue.base,
  },
  permissionButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  closeFallback: {
    position: 'absolute',
    top: space.xxl,
    left: space.lg,
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
