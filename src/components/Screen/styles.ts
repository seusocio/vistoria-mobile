import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  screen: {
    flex: 1,
  },
  loading: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 20,
  },
  skeletonBlock: {
    backgroundColor: colors.gray[100],
    borderRadius: 10,
  },
  skeletonIntro: {
    gap: 8,
  },
  skeletonTitle: {
    width: '46%',
    height: 20,
  },
  skeletonSubtitle: {
    width: '72%',
    height: 14,
  },
  skeletonFeature: {
    width: '100%',
    height: 112,
    borderRadius: 16,
  },
  skeletonList: {
    gap: 12,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  skeletonIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  skeletonCardBody: {
    flex: 1,
    gap: 8,
  },
  skeletonCardTitle: {
    width: '72%',
    height: 16,
  },
  skeletonCardSubtitle: {
    width: '48%',
    height: 12,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 20,
  },
  topHeader: {
    gap: 2,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  title: {
    ...textStyles.screenTitle,
  },
  subtitle: {
    ...textStyles.screenSubtitle,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: colors.white,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitleMuted: {
    ...textStyles.navTitleMuted,
  },
  navTitleStrong: {
    ...textStyles.navTitleStrong,
  },
})
