import * as ImagePicker from 'expo-image-picker'

export type PhotoSource = 'camera' | 'library'

export async function pickPhoto(source: PhotoSource): Promise<ImagePicker.ImagePickerAsset | null> {
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
        })

  return result.canceled ? null : (result.assets[0] ?? null)
}
