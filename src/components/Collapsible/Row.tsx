import { ReactNode } from 'react'
import { StyleProp, TextStyle, ViewStyle } from 'react-native'
import { ItemCard, type ItemCardRootProps } from '../ItemCard'
import { styles } from './styles'

export interface CollapsibleRowProps extends Omit<ItemCardRootProps, 'style'> {
  /** Merged over the shared row look - for state tints only, not for re-styling the row. */
  style?: StyleProp<ViewStyle>
}

/**
 * An ItemCard.Root already wearing the accordion's flat, full-bleed row look.
 * Screens compose their own content inside it with the usual ItemCard pieces;
 * the container design is not theirs to restate.
 */
export function CollapsibleRow({ style, ...props }: CollapsibleRowProps) {
  return <ItemCard.Root {...props} style={[styles.row, style]} />
}

export interface CollapsibleRowTitleProps {
  children: ReactNode
  numberOfLines?: number
  muted?: boolean
  style?: StyleProp<TextStyle>
}

/** An ItemCard.Title in the row weight that pairs with Collapsible.Header's title. */
export function CollapsibleRowTitle({
  style,
  ...props
}: CollapsibleRowTitleProps) {
  return <ItemCard.Title {...props} style={[styles.rowTitle, style]} />
}
