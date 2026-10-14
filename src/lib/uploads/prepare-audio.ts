import * as FileSystem from 'expo-file-system/legacy'

export interface PreparedAudio {
  uri: string
  mimeType: string
}

/**
 * Moves a finished recording into `documentDirectory/uploads/` — the same
 * durable folder photos use, so `rebaseLocalUri`/`deleteLocalUpload` and the
 * upload queue's recovery treat it like any other pending file. The recorder's
 * own output lives in a cache directory the OS may purge before the upload
 * drains.
 *
 * expo-audio's `HIGH_QUALITY` preset records AAC in an `.m4a` container on
 * both platforms, hence `audio/mp4`.
 */
export async function prepareAudioFile(sourceUri: string): Promise<PreparedAudio> {
  const directory = FileSystem.documentDirectory
  if (!directory) return { uri: sourceUri, mimeType: 'audio/mp4' }
  const uploadsDirectory = `${directory}uploads/`
  await FileSystem.makeDirectoryAsync(uploadsDirectory, { intermediates: true })
  const destination = `${uploadsDirectory}${Date.now()}-${Math.random().toString(36).slice(2)}.m4a`
  await FileSystem.copyAsync({ from: sourceUri, to: destination })
  return { uri: destination, mimeType: 'audio/mp4' }
}
