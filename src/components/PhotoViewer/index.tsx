import { Image } from 'expo-image'
import { useEffect, useRef, useState } from 'react'
import { FlatList, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { colors, space } from '@/styles'
import { Icon } from '../Icon'
import { ProgressBar } from '../ProgressBar'
import { styles } from './styles'

const DISMISS_DISTANCE = 120
const DISMISS_VELOCITY = 800

export interface PhotoViewerPhoto {
  id: string
  uri?: string
  uploading?: boolean
  progress?: number
}

export interface PhotoViewerProps {
  visible: boolean
  photos: PhotoViewerPhoto[]
  initialIndex: number
  onClose: () => void
  onDelete?: (id: string) => void
}

function PhotoPage({
  photo,
  width,
  height,
  onDismiss,
}: {
  photo: PhotoViewerPhoto
  width: number
  height: number
  onDismiss: () => void
}) {
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedTranslateX = useSharedValue(0)
  const savedTranslateY = useSharedValue(0)
  const dismissY = useSharedValue(0)
  const dismissOpacity = useSharedValue(1)

  const resetPan = () => {
    'worklet'
    translateX.value = withTiming(0)
    translateY.value = withTiming(0)
    savedTranslateX.value = 0
    savedTranslateY.value = 0
  }

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.max(1, Math.min(savedScale.value * event.scale, 4))
    })
    .onEnd(() => {
      savedScale.value = scale.value
      if (scale.value <= 1) resetPan()
    })

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value <= 1) return
      translateX.value = savedTranslateX.value + event.translationX
      translateY.value = savedTranslateY.value + event.translationY
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
    })

  // Locked to near-vertical drags so it never steals the horizontal swipe that pages between photos.
  const dismissPan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-15, 15])
    .onUpdate((event) => {
      if (scale.value > 1) return
      dismissY.value = event.translationY
      dismissOpacity.value = 1 - Math.min(Math.abs(event.translationY) / 400, 0.6)
    })
    .onEnd((event) => {
      if (scale.value > 1) return
      const shouldDismiss =
        Math.abs(event.translationY) > DISMISS_DISTANCE ||
        Math.abs(event.velocityY) > DISMISS_VELOCITY
      if (shouldDismiss) {
        dismissY.value = withTiming(event.translationY > 0 ? height : -height, { duration: 180 })
        dismissOpacity.value = withTiming(0, { duration: 180 }, (finished) => {
          if (finished) runOnJS(onDismiss)()
        })
      } else {
        dismissY.value = withTiming(0)
        dismissOpacity.value = withTiming(1)
      }
    })

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = scale.value > 1 ? 1 : 2
      scale.value = withTiming(next)
      savedScale.value = next
      if (next === 1) resetPan()
    })

  const composed = Gesture.Simultaneous(pinch, pan, dismissPan, doubleTap)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value + dismissY.value },
      { scale: scale.value },
    ],
    opacity: dismissOpacity.value,
  }))

  return (
    <View style={{ width, height }}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.page, animatedStyle]}>
          <Image
            source={photo.uri}
            style={styles.image}
            contentFit="contain"
            recyclingKey={photo.id}
            transition={0}
            accessibilityLabel="Foto em tela cheia"
          />
        </Animated.View>
      </GestureDetector>
      {photo.uploading && (
        <View style={styles.progressWrap}>
          <ProgressBar progress={photo.progress ?? 0} />
        </View>
      )}
    </View>
  )
}

/** Component/PhotoViewer — full-screen lightbox for the application/item galleries. */
export function PhotoViewer({
  visible,
  photos,
  initialIndex,
  onClose,
  onDelete,
}: PhotoViewerProps) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList<PhotoViewerPhoto>>(null)
  const [index, setIndex] = useState(initialIndex)

  useEffect(() => {
    if (visible) setIndex(initialIndex)
  }, [visible, initialIndex])

  useEffect(() => {
    if (visible && photos.length === 0) onClose()
  }, [visible, photos.length, onClose])

  useEffect(() => {
    if (!visible || photos.length === 0) return
    if (index > photos.length - 1) setIndex(photos.length - 1)
  }, [photos.length, visible, index])

  if (!visible || photos.length === 0) return null

  const current = photos[index]

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <FlatList
          ref={listRef}
          data={photos}
          keyExtractor={(photo) => photo.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          windowSize={3}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(event) => {
            setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
          }}
          renderItem={({ item }) => (
            <PhotoPage photo={item} width={width} height={height} onDismiss={onClose} />
          )}
        />
        <View style={[styles.overlayTop, { paddingTop: insets.top + space.sm }]}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Fechar">
            <Icon name="multiply" size={20} color={colors.white} />
          </Pressable>
          <Text style={styles.counter}>
            {index + 1} de {photos.length}
          </Text>
          {onDelete && current ? (
            <Pressable
              onPress={() => onDelete(current.id)}
              hitSlop={12}
              accessibilityLabel="Excluir foto"
            >
              <Icon name="trash-2" size={20} color={colors.white} />
            </Pressable>
          ) : (
            <View style={{ width: 20 }} />
          )}
        </View>
      </View>
    </Modal>
  )
}
