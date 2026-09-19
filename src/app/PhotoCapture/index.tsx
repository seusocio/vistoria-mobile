import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera'
import { useMemo, useRef, useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ConfirmBottomSheet, PhotoGalleryRow, PhotoViewer } from '@/components'
import type { PhotoGalleryItem } from '@/components/PhotoGalleryRow'
import { Icon } from '@/components/Icon'
import { useAttachPhotos } from '@/features/application/shared/use-attach-photos'
import { normalizeApplication, pickPhotos } from '@/infra/convex'
import type { Application } from '@/infra/domain/entities'
import { useUploadStore } from '@/infra/uploads/upload-store'
import { useEntity } from '@/lib/offline-queue'
import { StackRoutesProps } from '@/routes/types'
import { colors } from '@/styles'
import { haptics } from '@/utils/haptics'
import { api } from '../../../convex/_generated/api'
import { styles } from './styles'

interface StripPhoto {
  id: string
  uri: string
  failed: boolean
}

const FLASH_ORDER: FlashMode[] = ['off', 'auto', 'on']
const FLASH_LABEL: Record<FlashMode, string> = { off: 'Flash desligado', auto: 'Flash automático', on: 'Flash ligado', screen: 'Flash de tela' }

/** iOS reports physical lenses by `localizedName` (e.g. "Back Ultra Wide Camera"); there's no numeric zoom factor in that string. */
function lensLabel(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('ultra wide')) return '0,5'
  if (lower.includes('telephoto')) return '2'
  return '1'
}

function lensOrder(label: string): number {
  return Number(label.replace(',', '.'))
}

interface LensOption {
  name: string
  label: string
}

export function PhotoCapture({ navigation, route }: StackRoutesProps<'photoCapture'>) {
  const { applicationId, itemId } = route.params
  const insets = useSafeAreaInsets()
  const [permission, requestPermission] = useCameraPermissions()
  const { beginAttachment, commitAsset, removeAttachment } = useAttachPhotos()
  const uploadProgress = useUploadStore((state) => state.progress)

  const rawApplication = useEntity<Application>(
    api.applications.findById,
    { id: applicationId },
    applicationId,
  )
  const application = useMemo(
    () => (rawApplication ? normalizeApplication(rawApplication) : null),
    [rawApplication],
  )

  const cameraRef = useRef<CameraView>(null)
  const cancelledRef = useRef<Set<string>>(new Set())
  const captureChainRef = useRef<Promise<void>>(Promise.resolve())
  const sessionOffsetRef = useRef(0)
  const [ready, setReady] = useState(false)
  const [facing, setFacing] = useState<CameraType>('back')
  const [flash, setFlash] = useState<FlashMode>('off')
  const [availableLenses, setAvailableLenses] = useState<string[]>([])
  const [selectedLens, setSelectedLens] = useState<string | null>(null)
  const [strip, setStrip] = useState<StripPhoto[]>([])
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [discardVisible, setDiscardVisible] = useState(false)

  function markFailed(id: string) {
    setStrip((current) =>
      current.map((photo) => (photo.id === id ? { ...photo, failed: true } : photo)),
    )
  }

  function activeCount(): number {
    if (!application) return 0
    if (itemId === null) {
      return application.attachments.filter((attachment) => !attachment.deletedAt).length
    }
    return (
      application.items
        .find((item) => item.id === itemId)
        ?.attachments.filter((attachment) => !attachment.deletedAt).length ?? 0
    )
  }

  function findCommittedAttachment(id: string) {
    if (!application) return null
    const source =
      itemId === null
        ? application.attachments
        : application.items.find((item) => item.id === itemId)?.attachments ?? []
    return source.find((attachment) => attachment.id === id) ?? null
  }

  function nextPosition(): number {
    const position = activeCount() + sessionOffsetRef.current
    sessionOffsetRef.current += 1
    return position
  }

  /**
   * The shutter must never look/feel disabled while a previous shot is still
   * being captured — each tap enqueues a takePictureAsync call onto a chain
   * so native captures still run one at a time (required by the camera
   * hardware), while the button itself stays instantly tappable.
   */
  function handleShutter() {
    if (!ready || !cameraRef.current) return
    haptics.impact()
    const attachmentId = beginAttachment()
    const position = nextPosition()

    captureChainRef.current = captureChainRef.current.then(async () => {
      if (!cameraRef.current) return
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          skipProcessing: true,
          exif: false,
        })
        if (!photo) return

        setStrip((current) => [...current, { id: attachmentId, uri: photo.uri, failed: false }])
        void commitAsset({
          attachmentId,
          applicationId,
          itemId,
          uri: photo.uri,
          width: photo.width,
          height: photo.height,
          position,
          isCancelled: () => cancelledRef.current.has(attachmentId),
        }).catch(() => markFailed(attachmentId))
      } catch {
        // Nothing was added to the strip yet, so there's nothing to mark failed.
      }
    })
  }

  async function handlePickLibrary() {
    const assets = await pickPhotos('library')
    if (assets.length === 0) return
    assets.forEach((asset) => {
      const attachmentId = beginAttachment()
      const position = nextPosition()
      setStrip((current) => [...current, { id: attachmentId, uri: asset.uri, failed: false }])
      void commitAsset({
        attachmentId,
        applicationId,
        itemId,
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        position,
        isCancelled: () => cancelledRef.current.has(attachmentId),
      }).catch(() => markFailed(attachmentId))
    })
  }

  function handleRemoveFromStrip(id: string) {
    cancelledRef.current.add(id)
    setStrip((current) => current.filter((photo) => photo.id !== id))
    const committed = findCommittedAttachment(id)
    if (committed) {
      removeAttachment({ applicationId, itemId, attachment: committed })
    }
  }

  function handleToggleFacing() {
    setFacing((current) => (current === 'back' ? 'front' : 'back'))
    setSelectedLens(null)
    setAvailableLenses([])
  }

  function handleAvailableLensesChanged(event: { lenses: string[] }) {
    setAvailableLenses(event.lenses)
  }

  function handleSelectLens(lens: LensOption) {
    setSelectedLens(lens.label === '1' ? null : lens.name)
  }

  function handleCycleFlash() {
    setFlash((current) => {
      const index = FLASH_ORDER.indexOf(current)
      return FLASH_ORDER[(index + 1) % FLASH_ORDER.length]
    })
  }

  function handleClose() {
    if (strip.length === 0) {
      navigation.goBack()
      return
    }
    setDiscardVisible(true)
  }

  const galleryPhotos: PhotoGalleryItem[] = strip.map((photo) => ({
    id: photo.id,
    uri: photo.uri,
    failed: photo.failed,
    uploading: !photo.failed && uploadProgress[photo.id] !== undefined,
    progress: uploadProgress[photo.id] ?? 0,
    onPress: () => setViewerIndex(strip.findIndex((item) => item.id === photo.id)),
    onRemove: () => handleRemoveFromStrip(photo.id),
  }))

  const lensOptions: LensOption[] =
    facing === 'back'
      ? availableLenses
          .map((name) => ({ name, label: lensLabel(name) }))
          .filter((lens, index, all) => all.findIndex((other) => other.label === lens.label) === index)
          .sort((a, b) => lensOrder(a.label) - lensOrder(b.label))
      : []

  const viewerPhotos = strip.map((photo) => ({
    id: photo.id,
    uri: photo.uri,
    uploading: !photo.failed && uploadProgress[photo.id] !== undefined,
    progress: uploadProgress[photo.id] ?? 0,
  }))

  if (!permission) return null

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Pressable
          style={[styles.closeFallback, { top: insets.top + 8 }]}
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityLabel="Fechar"
        >
          <Icon name="multiply" size={20} color={colors.white} />
        </Pressable>
        <Text style={styles.permissionTitle}>Acesso à câmera necessário</Text>
        <Text style={styles.permissionMessage}>
          Permita o acesso à câmera para fotografar a vistoria.
        </Text>
        {permission.canAskAgain ? (
          <Pressable
            style={styles.permissionButton}
            onPress={() => void requestPermission()}
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
        <Pressable style={styles.topButton} onPress={handleClose} hitSlop={12} accessibilityLabel="Fechar">
          <Icon name="multiply" size={20} color={colors.white} />
        </Pressable>
        <Pressable
          style={styles.topButton}
          onPress={handleCycleFlash}
          hitSlop={12}
          accessibilityLabel={FLASH_LABEL[flash]}
        >
          <Text style={styles.topButtonLabel}>{flash === 'off' ? 'Flash' : flash === 'on' ? 'Flash on' : 'Flash auto'}</Text>
        </Pressable>
        <Pressable
          style={styles.topButton}
          onPress={handleToggleFacing}
          hitSlop={12}
          accessibilityLabel="Virar câmera"
        >
          <Icon name="repeat" size={20} color={colors.white} />
        </Pressable>
      </View>

      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        flash={flash}
        selectedLens={selectedLens ?? undefined}
        pictureSize="1920x1080"
        animateShutter={false}
        onCameraReady={() => setReady(true)}
        onAvailableLensesChanged={handleAvailableLensesChanged}
      />

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        {strip.length > 0 && (
          <PhotoGalleryRow photos={galleryPhotos} />
        )}
        {lensOptions.length > 1 && (
          <View style={styles.lensRow}>
            {lensOptions.map((lens) => {
              const active = selectedLens ? selectedLens === lens.name : lens.label === '1'
              return (
                <Pressable
                  key={lens.name}
                  style={[styles.lensPill, active && styles.lensPillActive]}
                  onPress={() => handleSelectLens(lens)}
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
            onPress={() => void handlePickLibrary()}
            accessibilityLabel="Escolher da biblioteca"
          >
            <Text style={styles.sideControlLabel}>Galeria</Text>
          </Pressable>

          <Pressable
            style={[styles.shutterOuter, !ready && styles.shutterOuterDisabled]}
            onPress={handleShutter}
            disabled={!ready}
            accessibilityLabel="Tirar foto"
          >
            <View style={styles.shutterInner} />
          </Pressable>

          <Pressable
            style={styles.completeButton}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Concluir captura"
          >
            <Text style={styles.completeButtonText}>Concluir{strip.length > 0 ? ` (${strip.length})` : ''}</Text>
          </Pressable>
        </View>
      </View>

      <PhotoViewer
        visible={viewerIndex !== null}
        photos={viewerPhotos}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
        onDelete={(id) => handleRemoveFromStrip(id)}
      />

      <ConfirmBottomSheet
        visible={discardVisible}
        title={`Sair com ${strip.length} foto${strip.length === 1 ? '' : 's'}?`}
        message="As fotos já tiradas continuam salvas. Este botão só fecha a câmera sem revisar."
        confirmLabel="Sair"
        warning={false}
        onCancel={() => setDiscardVisible(false)}
        onConfirm={() => {
          setDiscardVisible(false)
          navigation.goBack()
        }}
      />
    </View>
  )
}
