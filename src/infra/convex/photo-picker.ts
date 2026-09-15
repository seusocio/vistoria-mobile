import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'

export type PhotoSource = 'camera' | 'library'
export type PickedPhoto = ImagePicker.ImagePickerAsset

export async function pickPhotos(source: PhotoSource): Promise<PickedPhoto[]> {
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.85,
          exif: false,
          allowsEditing: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.85,
          exif: false,
          allowsEditing: false,
          allowsMultipleSelection: true,
          selectionLimit: 0,
        })

  return result.canceled ? [] : result.assets
}

export async function prepareAsset(asset: PickedPhoto): Promise<PickedPhoto> {
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
    return { ...asset, uri: resized.uri, mimeType: 'image/jpeg' }
  }

  const uploadsDirectory = `${directory}uploads/`
  await FileSystem.makeDirectoryAsync(uploadsDirectory, { intermediates: true })
  const destination = `${uploadsDirectory}${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.jpg`
  await FileSystem.copyAsync({ from: resized.uri, to: destination })

  return {
    ...asset,
    uri: destination,
    fileName: asset.fileName
      ? `${asset.fileName.replace(/\.[^.]+$/, '')}.jpg`
      : undefined,
    mimeType: 'image/jpeg',
    width: resized.width,
    height: resized.height,
  }
}
