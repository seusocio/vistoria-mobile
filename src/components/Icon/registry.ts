import type { Icon as PhosphorIcon, IconWeight } from 'phosphor-react-native'
import type { IconName } from './types'

/**
 * Per-icon deep `require`s, on purpose:
 *
 * - Not the package root: Metro doesn't tree-shake, and the root re-exports
 *   every Phosphor icon (well over a thousand) - it would ship them all.
 * - Not `import`: the deep path points at the package's .tsx source, which
 *   doesn't typecheck under our strict settings. A `require` isn't followed by
 *   tsc, and `glyph` puts the type back.
 *
 * Don't fix the types with a `paths` entry in tsconfig.json instead: Expo's
 * dev server reads those paths too.
 */
const glyph = (component: unknown) => component as PhosphorIcon

export interface IconDefinition {
  component: PhosphorIcon
  /**
   * Overrides the app-wide weight for this glyph. Media controls read as
   * buttons only when solid, so they use `fill`.
   */
  weight?: IconWeight
}

/**
 * The app's names, mapped onto Phosphor glyphs. Call sites keep using the
 * app's names (`<Icon name="trash-2" />`), so swapping a glyph is a one-line
 * change here. To add one, pick it on phosphoricons.com, add its name to
 * `IconName` and an entry below.
 */
export const iconRegistry: Record<IconName, IconDefinition> = {
  'alert-triangle': { component: glyph(require('phosphor-react-native/src/icons/Warning').WarningIcon) },
  'bar-chart': { component: glyph(require('phosphor-react-native/src/icons/ChartBar').ChartBarIcon) },
  calendar: { component: glyph(require('phosphor-react-native/src/icons/CalendarBlank').CalendarBlankIcon) },
  camera: { component: glyph(require('phosphor-react-native/src/icons/Camera').CameraIcon) },
  check: { component: glyph(require('phosphor-react-native/src/icons/Check').CheckIcon) },
  'chevron-down': { component: glyph(require('phosphor-react-native/src/icons/CaretDown').CaretDownIcon) },
  'chevron-left': { component: glyph(require('phosphor-react-native/src/icons/CaretLeft').CaretLeftIcon) },
  'chevron-right': { component: glyph(require('phosphor-react-native/src/icons/CaretRight').CaretRightIcon) },
  'chevron-up': { component: glyph(require('phosphor-react-native/src/icons/CaretUp').CaretUpIcon) },
  'clipboard-check': { component: glyph(require('phosphor-react-native/src/icons/ClipboardText').ClipboardTextIcon) },
  copy: { component: glyph(require('phosphor-react-native/src/icons/Copy').CopyIcon) },
  'credit-card': { component: glyph(require('phosphor-react-native/src/icons/CreditCard').CreditCardIcon) },
  'direction-up-right': { component: glyph(require('phosphor-react-native/src/icons/ArrowUpRight').ArrowUpRightIcon) },
  droplet: { component: glyph(require('phosphor-react-native/src/icons/Drop').DropIcon) },
  'edit-pen': { component: glyph(require('phosphor-react-native/src/icons/PencilSimple').PencilSimpleIcon) },
  filter: { component: glyph(require('phosphor-react-native/src/icons/FunnelSimple').FunnelSimpleIcon) },
  'grip-vertical': { component: glyph(require('phosphor-react-native/src/icons/DotsSixVertical').DotsSixVerticalIcon) },
  mic: { component: glyph(require('phosphor-react-native/src/icons/Microphone').MicrophoneIcon) },
  minus: { component: glyph(require('phosphor-react-native/src/icons/Minus').MinusIcon) },
  'more-vertical': { component: glyph(require('phosphor-react-native/src/icons/DotsThreeVertical').DotsThreeVerticalIcon) },
  multiply: { component: glyph(require('phosphor-react-native/src/icons/X').XIcon) },
  'note-with-text': { component: glyph(require('phosphor-react-native/src/icons/Note').NoteIcon) },
  play: { component: glyph(require('phosphor-react-native/src/icons/Play').PlayIcon), weight: 'fill' },
  plus: { component: glyph(require('phosphor-react-native/src/icons/Plus').PlusIcon) },
  repeat: { component: glyph(require('phosphor-react-native/src/icons/Repeat').RepeatIcon) },
  search: { component: glyph(require('phosphor-react-native/src/icons/MagnifyingGlass').MagnifyingGlassIcon) },
  shop: { component: glyph(require('phosphor-react-native/src/icons/Storefront').StorefrontIcon) },
  square: { component: glyph(require('phosphor-react-native/src/icons/Stop').StopIcon), weight: 'fill' },
  tag: { component: glyph(require('phosphor-react-native/src/icons/Tag').TagIcon) },
  'trash-2': { component: glyph(require('phosphor-react-native/src/icons/Trash').TrashIcon) },
  user: { component: glyph(require('phosphor-react-native/src/icons/User').UserIcon) },
}
