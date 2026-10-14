// PROTOTYPE — mounts the Visita redesign on the real application-fill route, reusing
// the real container for data, photo publishing, the checklist list and back/flush.
import { Screen } from '@/components'
import {
  useApplicationFillContainer,
  type UseApplicationFillContainerProps,
} from '../application-fill.container'
import { VisitaPrototype } from './VisitaPrototype'

export function VisitaPrototypeHost(props: UseApplicationFillContainerProps) {
  const c = useApplicationFillContainer(props)
  if (c.loading) return <Screen loading variant="nested" onBack={c.onBack} title="Visita" />
  return <VisitaPrototype c={c} />
}
