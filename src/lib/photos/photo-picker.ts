import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'

export type PhotoSource = 'library'
export type PickedPhoto = ImagePicker.ImagePickerAsset

export interface RawAsset {
  uri: string
  width: number
  height: number
}

export interface PreparedAsset {
  uri: string
  width: number
  height: number
  mimeType: string
}

/** Shown when the library pick fails — almost always the system Photos export, not the app. */
export const PICK_PHOTOS_ERROR_MESSAGE =
  'O iOS não conseguiu entregar as fotos selecionadas. Verifique se há espaço livre no aparelho e tente novamente.'

export async function pickPhotos(source: PhotoSource): Promise<PickedPhoto[]> {
  void source
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // With `Current` (the default), a failed Photos export — e.g. the device
    // is low on storage (CloudPhotoLibraryErrorDomain 1005) — left the pick
    // hanging forever with no error. `Compatible` makes the same failure
    // reject, so the caller can tell the user instead of showing nothing.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    quality: 0.85,
    exif: false,
    allowsEditing: false,
    allowsMultipleSelection: true,
    selectionLimit: 0,
  })

  return result.canceled ? [] : result.assets
}

export async function prepareAsset(asset: RawAsset): Promise<PreparedAsset> {
  const resized = await ImageManipulator.manipulateAsync(
    asset.uri,
    asset.width > 1600 ? [{ resize: { width: 400 } }] : [],
    {
      compress: 0.5,
      format: ImageManipulator.SaveFormat.WEBP,
    },
  )

  const directory = FileSystem.documentDirectory
  if (!directory) {
    return { uri: resized.uri, width: resized.width, height: resized.height, mimeType: 'image/jpeg' }
  }

  const uploadsDirectory = `${directory}uploads/`
  await FileSystem.makeDirectoryAsync(uploadsDirectory, { intermediates: true })
  const destination = `${uploadsDirectory}${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.jpg`
  await FileSystem.moveAsync({ from: resized.uri, to: destination })

  return {
    uri: destination,
    width: resized.width,
    height: resized.height,
    mimeType: 'image/jpeg',
  }
}

/**
 * Serializes prepareAsset calls so rapid-fire shutter presses don't pile up
 * concurrent manipulateAsync (decode/resize/encode) calls competing with the
 * live camera pipeline for the same hardware codec.
 */
let processingChain: Promise<unknown> = Promise.resolve()
export function prepareAssetQueued(asset: RawAsset): Promise<PreparedAsset> {
  const result = processingChain.then(() => prepareAsset(asset))
  processingChain = result.catch(() => undefined)
  return result
}

/**
 * Re-points a persisted `.../uploads/<file>` URI at the current app container.
 *
 * iOS puts `documentDirectory` under a container UUID that changes whenever
 * the app is rebuilt/updated, while the persisted upload queue (and the
 * outbox ops carrying a `localUri`) keep the absolute path from the previous
 * install. The file itself is migrated with the container, so only the prefix
 * is stale — and left alone, every pending photo fails with "file not found"
 * and blocks the sync bar red forever.
 */
export function rebaseLocalUri(uri: string): string
export function rebaseLocalUri(uri: string | undefined): string | undefined
export function rebaseLocalUri(uri: string | undefined): string | undefined {
  const directory = FileSystem.documentDirectory
  if (!uri || !directory) return uri
  const marker = '/uploads/'
  const index = uri.lastIndexOf(marker)
  if (index === -1) return uri
  return `${directory}uploads/${uri.slice(index + marker.length)}`
}

/** The photo an upload job points at is gone from disk — retrying can't bring it back. */
export class MissingLocalFileError extends Error {
  constructor(uri: string) {
    super(`Arquivo local não encontrado: ${uri}`)
    this.name = 'MissingLocalFileError'
  }
}

/**
 * Must run before every native `createUploadTask`: on iOS the upload goes
 * through a background `NSURLSession`, which throws an Objective-C exception
 * for a missing source file. JS can't catch that — it aborts the app, and since
 * the job stays in the persisted queue, it aborts every launch after it too.
 */
export async function assertLocalFileExists(uri: string): Promise<void> {
  const info = uri ? await FileSystem.getInfoAsync(uri) : null
  if (!info?.exists || info.isDirectory) throw new MissingLocalFileError(uri)
}

export async function deleteLocalUpload(uri?: string): Promise<void> {
  if (!uri || !uri.includes('/uploads/')) return
  await FileSystem.deleteAsync(rebaseLocalUri(uri), { idempotent: true })
}
