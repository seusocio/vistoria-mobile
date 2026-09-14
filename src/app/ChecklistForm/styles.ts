import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  container: {
    gap: 22,
  },
  section: {
    gap: 8,
  },
  fieldLabel: {
    ...textStyles.fieldLabel,
  },

  templateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  templateCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.gray[200],
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  templateCardSelected: {
    backgroundColor: colors.blue.tint,
    borderColor: colors.blue.base,
    borderWidth: 1.5,
  },
  templateLabel: {
    ...textStyles.badgeLabel,
    color: colors.gray[600],
    textAlign: 'center',
  },
  templateLabelSelected: {
    color: colors.blue.base,
  },

  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  optionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderCurve: 'continuous',
  },
  optionInput: {
    ...textStyles.fieldLabel,
    color: colors.ink.base,
    minWidth: 50,
    padding: 0,
  },
  addOptionButton: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.blue.base,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addOptionText: {
    ...textStyles.badgeLabel,
    color: colors.blue.base,
  },

  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemsCount: {
    ...textStyles.metaLabel,
  },
  itemsList: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: 12,
  },
  itemNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemNumText: {
    ...textStyles.badgeLabel,
    color: colors.gray[600],
  },
  itemCol: {
    flex: 1,
    gap: 8,
  },
  itemTitleInput: {
    ...textStyles.fieldLabel,
    fontSize: 13,
    color: colors.ink.base,
    padding: 0,
  },
  itemDescriptionInput: {
    ...textStyles.body,
    padding: 0,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingVertical: 13,
  },
  addItemButtonText: {
    ...textStyles.buttonLabel,
    color: colors.ink.base,
  },

  error: {
    ...textStyles.body,
    color: colors.danger.base,
  },
})
