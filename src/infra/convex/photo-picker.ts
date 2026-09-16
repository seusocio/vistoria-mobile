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

export async function pickPhotos(source: PhotoSource): Promise<PickedPhoto[]> {
  void source
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
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
    asset.width > 1600 ? [{ resize: { width: 1600 } }] : [],
    {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
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
  await FileSystem.copyAsync({ from: resized.uri, to: destination })

  return {
    uri: destination,
    width: resized.width,
    height: resized.height,
    mimeType: 'image/jpeg',
  }
}

export async function deleteLocalUpload(uri?: string): Promise<void> {
  if (!uri || !uri.includes('/uploads/')) return
  await FileSystem.deleteAsync(uri, { idempotent: true })
}
