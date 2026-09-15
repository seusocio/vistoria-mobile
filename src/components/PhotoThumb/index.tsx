import { Image } from 'expo-image'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { ProgressBar } from '../ProgressBar'
import { styles } from './styles'

export interface PhotoThumbProps {
  uri?: string
  onRemove?: () => void
  uploading?: boolean
  progress?: number
}

/** Component/PhotoThumb */
export function PhotoThumb({
  uri,
  onRemove,
  uploading = false,
  progress = 0,
}: PhotoThumbProps) {

  return (
    <View style={styles.container}>
      {uri ? (
        <Image
          source={uri}
          style={styles.image}
          contentFit="cover"
          accessibilityLabel="Foto anexada"
        />
      ) : (
        <Icon name="camera" size={20} color={colors.gray[400]} />
      )}
      {uploading && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="small" color={colors.white} />
          <View style={styles.uploadingProgress}>
            <ProgressBar progress={progress} />
          </View>
        </View>
      )}
      {onRemove && !uploading && (
        <Pressable
          style={({ pressed }) => [
            styles.removeButton,
            pressed && { opacity: 0.7 },
          ]}
          hitSlop={14}
          onPress={onRemove}
          accessibilityLabel="Remover foto"
        >
          <Icon name="multiply" size={10} color={colors.white} />
        </Pressable>
      )}
    </View>
  )
}

export interface AddPhotoButtonProps {
  onPress: () => void
}

export function AddPhotoButton({ onPress }: AddPhotoButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      accessibilityLabel="Adicionar foto"
    >
      <Icon name="plus" size={18} color={colors.blue.base} />
    </Pressable>
  )
}
