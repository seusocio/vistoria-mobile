import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera'
import { useMemo, useRef, useState } from 'react'
import type { PhotoGalleryItem } from '@/components/PhotoGalleryRow'
import { useApplicationRestResult } from '@/features/application/shared/application.rest'
import type { Application } from '@/features/application/shared/application.types'
import { useAttachPhotos } from '@/features/application/shared/use-attach-photos'
import { normalizeApplication, pickPhotos } from '@/lib/convex'
import { useEntity } from '@/lib/offline-queue'
import { useUploadStore } from '@/lib/uploads/upload-store'
import type { StackRoutesList } from '@/routes/types'
import { haptics } from '@/utils/haptics'
import { api } from '../../../../convex/_generated/api'

interface StripPhoto {
  id: string
  uri: string
  failed: boolean
}

export interface LensOption {
  name: string
  label: string
}

export const FLASH_ORDER: FlashMode[] = ['off', 'auto', 'on']
export const FLASH_LABEL: Record<FlashMode, string> = {
  off: 'Flash desligado',
  auto: 'Flash automático',
  on: 'Flash ligado',
  screen: 'Flash de tela',
}

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

type Navigation = NativeStackNavigationProp<StackRoutesList, keyof StackRoutesList>

export interface UsePhotoCaptureContainerProps {
  applicationId: string
  itemId: string | null
  navigation: Navigation
}

export function usePhotoCaptureContainer({
  applicationId,
  itemId,
  navigation,
}: UsePhotoCaptureContainerProps) {
  const [permission, requestPermission] = useCameraPermissions()
  const { beginAttachment, commitAsset, removeAttachment } = useAttachPhotos()
  const uploadProgress = useUploadStore((state) => state.progress)

  const applicationRest = useApplicationRestResult(applicationId)
  const rawApplication = useEntity<Application>(
    api.applications.findById,
    { id: applicationId },
    applicationId,
    'application',
    applicationRest,
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
  function onShutter() {
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

  async function onPickLibrary() {
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

  function onRemoveFromStrip(id: string) {
    cancelledRef.current.add(id)
    setStrip((current) => current.filter((photo) => photo.id !== id))
    const committed = findCommittedAttachment(id)
    if (committed) {
      removeAttachment({ applicationId, itemId, attachment: committed })
    }
  }

  const galleryPhotos: PhotoGalleryItem[] = strip.map((photo) => ({
    id: photo.id,
    uri: photo.uri,
    failed: photo.failed,
    uploading: !photo.failed && uploadProgress[photo.id] !== undefined,
    progress: uploadProgress[photo.id] ?? 0,
    onPress: () => setViewerIndex(strip.findIndex((item) => item.id === photo.id)),
    onRemove: () => onRemoveFromStrip(photo.id),
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

  return {
    permission,
    requestPermission,
    cameraRef,
    ready,
    facing,
    flash,
    selectedLens,
    lensOptions,
    strip,
    galleryPhotos,
    viewerPhotos,
    viewerIndex,
    onCameraReady: () => setReady(true),
    onAvailableLensesChanged: (event: { lenses: string[] }) => setAvailableLenses(event.lenses),
    onSelectLens: (lens: LensOption) => setSelectedLens(lens.label === '1' ? null : lens.name),
    onToggleFacing: () => {
      setFacing((current) => (current === 'back' ? 'front' : 'back'))
      setSelectedLens(null)
      setAvailableLenses([])
    },
    onCycleFlash: () =>
      setFlash((current) => FLASH_ORDER[(FLASH_ORDER.indexOf(current) + 1) % FLASH_ORDER.length]),
    onShutter,
    onPickLibrary,
    onRemoveFromStrip,
    onCloseViewer: () => setViewerIndex(null),
    // No "descartar" confirmation: every photo taken here is already queued
    // and durable the moment the shutter fires, so leaving the camera can't
    // lose anything — there is nothing to confirm.
    onClose: () => navigation.goBack(),
  }
}
