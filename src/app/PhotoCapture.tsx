import { PhotoCaptureView } from '@/features/application/photo-capture'
import type { StackRoutesProps } from '@/routes/types'

export function PhotoCapture({ navigation, route }: StackRoutesProps<'photoCapture'>) {
  const { applicationId, itemId } = route.params
  return (
    <PhotoCaptureView applicationId={applicationId} itemId={itemId} navigation={navigation} />
  )
}
