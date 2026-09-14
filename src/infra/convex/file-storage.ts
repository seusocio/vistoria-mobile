import * as FileSystem from 'expo-file-system/legacy'
import { Platform } from 'react-native'
import { api } from '../../../convex/_generated/api'
import { convexClient } from './client'

interface UploadResponse {
  storageId: string
}

function isUploadResponse(value: unknown): value is UploadResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'storageId' in value &&
    typeof value.storageId === 'string'
  )
}

export async function uploadImage(
  uri: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const uploadUrl = await convexClient.mutation(api.files.generateUploadUrl, {})
  let responseBody: string

  if (Platform.OS === 'web') {
    const response = await fetch(uri)
    if (!response.ok) throw new Error('Não foi possível ler a foto selecionada')
    const blob = await response.blob()
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': mimeType || blob.type || 'image/jpeg' },
      body: blob,
    })
    if (!uploadResponse.ok) {
      throw new Error('Não foi possível enviar a foto para o Convex')
    }
    responseBody = await uploadResponse.text()
  } else {
    const uploadResponse = await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': mimeType || 'image/jpeg' },
    })
    if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
      throw new Error('Não foi possível enviar a foto para o Convex')
    }
    responseBody = uploadResponse.body
  }

  let payload: unknown
  try {
    payload = JSON.parse(responseBody) as unknown
  } catch {
    throw new Error('Resposta inválida do armazenamento de imagens')
  }
  if (!isUploadResponse(payload)) {
    throw new Error('Resposta inválida do armazenamento de imagens')
  }
  return payload.storageId
}
