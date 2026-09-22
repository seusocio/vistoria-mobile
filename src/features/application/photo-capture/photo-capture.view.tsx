import { CameraView } from 'expo-camera'
import { Linking, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PhotoGalleryRow, PhotoViewer } from '@/components'
import { Icon } from '@/components/Icon'
import { colors } from '@/styles'
import {
  FLASH_LABEL,
  usePhotoCaptureContainer,
  type UsePhotoCaptureContainerProps,
} from './photo-capture.container'
import { styles } from './photo-capture.styles'

export function PhotoCaptureView(props: UsePhotoCaptureContainerProps) {
  const insets = useSafeAreaInsets()
  const c = usePhotoCaptureContainer(props)

  if (!c.permission) return null

  if (!c.permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Pressable
          style={[styles.closeFallback, { top: insets.top + 8 }]}
          onPress={c.onClose}
          hitSlop={12}
          accessibilityLabel="Fechar"
        >
          <Icon name="multiply" size={20} color={colors.white} />
        </Pressable>
        <Text style={styles.permissionTitle}>Acesso à câmera necessário</Text>
        <Text style={styles.permissionMessage}>
          Permita o acesso à câmera para fotografar a vistoria.
        </Text>
        {c.permission.canAskAgain ? (
          <Pressable
            style={styles.permissionButton}
            onPress={() => void c.requestPermission()}
            accessibilityLabel="Permitir acesso à câmera"
          >
            <Text style={styles.permissionButtonText}>Permitir acesso</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.permissionButton}
            onPress={() => void Linking.openSettings()}
            accessibilityLabel="Abrir ajustes"
          >
            <Text style={styles.permissionButtonText}>Abrir ajustes</Text>
          </Pressable>
        )}
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.topButton} onPress={c.onClose} hitSlop={12} accessibilityLabel="Fechar">
          <Icon name="multiply" size={20} color={colors.white} />
        </Pressable>
        <Pressable
          style={styles.topButton}
          onPress={c.onCycleFlash}
          hitSlop={12}
          accessibilityLabel={FLASH_LABEL[c.flash]}
        >
          <Text style={styles.topButtonLabel}>
            {c.flash === 'off' ? 'Flash' : c.flash === 'on' ? 'Flash on' : 'Flash auto'}
          </Text>
        </Pressable>
        <Pressable
          style={styles.topButton}
          onPress={c.onToggleFacing}
          hitSlop={12}
          accessibilityLabel="Virar câmera"
        >
          <Icon name="repeat" size={20} color={colors.white} />
        </Pressable>
      </View>

      <CameraView
        ref={c.cameraRef}
        style={styles.camera}
        facing={c.facing}
        flash={c.flash}
        selectedLens={c.selectedLens ?? undefined}
        pictureSize="1920x1080"
        animateShutter={false}
        onCameraReady={c.onCameraReady}
        onAvailableLensesChanged={c.onAvailableLensesChanged}
      />

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        {c.strip.length > 0 && <PhotoGalleryRow photos={c.galleryPhotos} />}
        {c.lensOptions.length > 1 && (
          <View style={styles.lensRow}>
            {c.lensOptions.map((lens) => {
              const active = c.selectedLens ? c.selectedLens === lens.name : lens.label === '1'
              return (
                <Pressable
                  key={lens.name}
                  style={[styles.lensPill, active && styles.lensPillActive]}
                  onPress={() => c.onSelectLens(lens)}
                  hitSlop={8}
                  accessibilityLabel={`Lente ${lens.label}x`}
                >
                  <Text style={[styles.lensPillText, active && styles.lensPillTextActive]}>
                    {lens.label}x
                  </Text>
                </Pressable>
              )
            })}
          </View>
        )}
        <View style={styles.controlsRow}>
          <Pressable
            style={styles.sideControl}
            onPress={() => void c.onPickLibrary()}
            accessibilityLabel="Escolher da biblioteca"
          >
            <Text style={styles.sideControlLabel}>Galeria</Text>
          </Pressable>

          <Pressable
            style={[styles.shutterOuter, !c.ready && styles.shutterOuterDisabled]}
            onPress={c.onShutter}
            disabled={!c.ready}
            accessibilityLabel="Tirar foto"
          >
            <View style={styles.shutterInner} />
          </Pressable>

          <Pressable
            style={styles.completeButton}
            onPress={c.onClose}
            accessibilityLabel="Concluir captura"
          >
            <Text style={styles.completeButtonText}>
              Concluir{c.strip.length > 0 ? ` (${c.strip.length})` : ''}
            </Text>
          </Pressable>
        </View>
      </View>

      <PhotoViewer
        visible={c.viewerIndex !== null}
        photos={c.viewerPhotos}
        initialIndex={c.viewerIndex ?? 0}
        onClose={c.onCloseViewer}
        onDelete={c.onRemoveFromStrip}
      />
    </View>
  )
}
