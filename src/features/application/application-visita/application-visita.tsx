import { Screen } from '@/components'
import {
  useApplicationFillContainer,
  type UseApplicationFillContainerProps,
} from '../application-fill/application-fill.container'
import { ApplicationVisitaView } from './application-visita.view'

/**
 * The visit screen. Reuses `application-fill`'s container unchanged — data,
 * item edits and their flush points, photos, voice, draft/complete/delete — so
 * the legacy view (still mounted for `?variant=A`) and this one can't drift.
 */
export function ApplicationVisita(props: UseApplicationFillContainerProps) {
  const c = useApplicationFillContainer(props)
  if (c.loading) return <Screen loading variant="nested" onBack={c.onBack} title="Visita" />
  return (
    <ApplicationVisitaView
      c={c}
      onOpenNoteCamera={() =>
        props.navigation.navigate('photoCapture', {
          applicationId: c.application.id,
          itemId: null,
          asNote: true,
        })
      }
    />
  )
}
