import { colors } from './colors'
import { fontFamily } from './typography'

interface NamedTextStyle {
  fontSize: number
  fontFamily: string
  color: string
}

function style(
  fontSize: number,
  weight: keyof typeof fontFamily,
  color: string,
): NamedTextStyle {
  return { fontSize, fontFamily: fontFamily[weight], color }
}

/**
 * Named after where each style is used in the Pencil design source, so it's
 * easy to trace a screen's text back to its spec.
 */
export const textStyles = {
  screenTitle: style(24, 'extraBold', colors.ink.base),
  screenSubtitle: style(13, 'medium', colors.gray[600]),

  drawerTitle: style(17, 'extraBold', colors.ink.base),
  navTitleStrong: style(15, 'bold', colors.ink.base),
  navTitleMuted: style(13, 'semiBold', colors.gray[600]),

  cardTitle: style(16, 'bold', colors.ink.base),
  buttonLabel: style(15, 'semiBold', colors.white),

  itemTitle: style(14, 'bold', colors.ink.base),
  inputValue: style(14, 'semiBold', colors.ink.base),
  inputPlaceholder: style(14, 'medium', colors.gray[400]),

  bodyStrong: style(13, 'bold', colors.ink.base),
  body: style(13, 'medium', colors.gray[600]),
  sectionTitle: style(13, 'bold', colors.gray[400]),

  fieldLabel: style(12, 'semiBold', colors.gray[600]),
  metricValue: style(24, 'bold', colors.ink.base),
  metricLabel: style(12, 'medium', colors.gray[600]),
  chipLabel: style(12, 'semiBold', colors.blue.base),

  metaLabel: style(11, 'medium', colors.gray[400]),
  badgeLabel: style(11, 'bold', colors.warning.base),

  tabLabel: style(10, 'semiBold', colors.gray[400]),
} as const
