import * as ImagePicker from 'expo-image-picker'

export type PhotoSource = 'camera' | 'library'

export type PickedPhoto = ImagePicker.ImagePickerAsset

export async function pickPhotos(source: PhotoSource): Promise<PickedPhoto[]> {
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.85,
          allowsEditing: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.85,
          allowsEditing: false,
          allowsMultipleSelection: true,
          selectionLimit: 0,
        })

  return result.canceled ? [] : result.assets
}
