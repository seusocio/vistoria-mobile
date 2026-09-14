/**
 * Typography tokens, using the Lato font family from the original design
 * system. The old system only ever used two weights (regular/bold), so every
 * tier collapses to one of those two instead of introducing a heavier Black
 * weight the original design never had.
 */

export const fontFamily = {
  regular: 'Lato_400Regular',
  medium: 'Lato_400Regular',
  semiBold: 'Lato_700Bold',
  bold: 'Lato_700Bold',
  extraBold: 'Lato_700Bold',
} as const

export type FontWeightToken = keyof typeof fontFamily
