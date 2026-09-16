import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native'
import { memo, useCallback } from 'react'
import { View } from 'react-native'
import { AddPhotoButton, PhotoThumb } from '../PhotoThumb'
import type { PhotoThumbProps } from '../PhotoThumb'
import { styles } from './styles'

export interface PhotoGalleryItem
  extends Omit<PhotoThumbProps, 'onRemove' | 'onPress' | 'onRetry'> {
  id: string
  onRemove?: () => void
  onPress?: () => void
  onRetry?: () => void
}

interface PhotoGalleryRowProps {
  photos: PhotoGalleryItem[]
  onAddPhoto?: () => void
}

const PhotoSeparator = () => <View style={styles.separator} />
const photoKeyExtractor = (photo: PhotoGalleryItem) => photo.id

export const PhotoGalleryRow = memo(function PhotoGalleryRow({
  photos,
  onAddPhoto,
}: PhotoGalleryRowProps) {
  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<PhotoGalleryItem>) => (
      <PhotoThumb
        uri={item.uri}
        uploading={item.uploading}
        progress={item.progress}
        failed={item.failed}
        onRemove={item.onRemove}
        onPress={item.onPress}
        onRetry={item.onRetry}
      />
    ),
    [],
  )
  return (
    <LegendList
      horizontal
      data={photos}
      renderItem={renderItem}
      keyExtractor={photoKeyExtractor}
      ItemSeparatorComponent={PhotoSeparator}
      ListFooterComponent={onAddPhoto ? <AddPhotoButton onPress={onAddPhoto} /> : null}
      contentContainerStyle={styles.content}
      estimatedItemSize={72}
      recycleItems
      showsHorizontalScrollIndicator={false}
    />
  )
})
