import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  box: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 12,
  },
  boxAccent: {
    borderColor: colors.blue.base,
    borderWidth: 1.5,
  },
  boxMuted: {
    backgroundColor: colors.gray[100],
  },
  input: {
    flexGrow: 1,
    minWidth: 100,
    ...textStyles.inputValue,
    color: colors.gray[400],
    padding: 0,
  },
  suggestions: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.gray[200],
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  suggestionText: {
    ...textStyles.body,
    color: colors.ink.base,
  },
  createText: {
    ...textStyles.body,
    fontFamily: textStyles.bodyStrong.fontFamily,
    color: colors.blue.base,
  },
})
