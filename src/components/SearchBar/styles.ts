import { StyleSheet } from 'react-native'
import { colors, radius, space, textStyles, touch } from '@/styles'

export const styles = StyleSheet.create({
  container: {
    minHeight: touch.min,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.gray[100],
    borderRadius: radius.sheet,
    paddingHorizontal: space.md,
  },
  input: {
    flex: 1,
    ...textStyles.inputValue,
    color: colors.ink.base,
    padding: 0,
  },
  clearButton: {
    minWidth: touch.min,
    minHeight: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: -space.sm,
    marginRight: -space.sm,
  },
})
