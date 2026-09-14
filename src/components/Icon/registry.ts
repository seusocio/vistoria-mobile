import { AlertTriangle } from '@/assets/icon-components/alert-triangle'
import { BarChart } from '@/assets/icon-components/bar-chart'
import { Calendar } from '@/assets/icon-components/calendar'
import { Camera } from '@/assets/icon-components/camera'
import { Check } from '@/assets/icon-components/check'
import { ChevronDown } from '@/assets/icon-components/chevron-down'
import { ChevronLeft } from '@/assets/icon-components/chevron-left'
import { ChevronRight } from '@/assets/icon-components/chevron-right'
import { ChevronUp } from '@/assets/icon-components/chevron-up'
import { ClipboardCheck } from '@/assets/icon-components/clipboard-check'
import { Copy } from '@/assets/icon-components/copy'
import { CreditCard } from '@/assets/icon-components/credit-card'
import { DirectionUpRight } from '@/assets/icon-components/direction-up-right'
import { Droplet } from '@/assets/icon-components/droplet'
import { EditPen } from '@/assets/icon-components/edit-pen'
import { Filter } from '@/assets/icon-components/filter'
import { GripVertical } from '@/assets/icon-components/grip-vertical'
import { Mic } from '@/assets/icon-components/mic'
import { Minus } from '@/assets/icon-components/minus'
import { Multiply } from '@/assets/icon-components/multiply'
import { NoteWithText } from '@/assets/icon-components/note-with-text'
import { Play } from '@/assets/icon-components/play'
import { Plus } from '@/assets/icon-components/plus'
import { Repeat } from '@/assets/icon-components/repeat'
import { Search } from '@/assets/icon-components/search'
import { Shop } from '@/assets/icon-components/shop'
import { Square } from '@/assets/icon-components/square'
import { Tag } from '@/assets/icon-components/tag'
import { Trash2 } from '@/assets/icon-components/trash-2'
import { User } from '@/assets/icon-components/user'
import { IconName, IconProps } from './types'

export const iconRegistry: Record<IconName, React.ComponentType<IconProps>> = {
  'alert-triangle': AlertTriangle,
  'bar-chart': BarChart,
  calendar: Calendar,
  camera: Camera,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'clipboard-check': ClipboardCheck,
  copy: Copy,
  'credit-card': CreditCard,
  'direction-up-right': DirectionUpRight,
  droplet: Droplet,
  'edit-pen': EditPen,
  filter: Filter,
  'grip-vertical': GripVertical,
  mic: Mic,
  minus: Minus,
  multiply: Multiply,
  'note-with-text': NoteWithText,
  play: Play,
  plus: Plus,
  repeat: Repeat,
  search: Search,
  shop: Shop,
  square: Square,
  tag: Tag,
  'trash-2': Trash2,
  user: User,
} as const
