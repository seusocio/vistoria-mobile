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
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const uploadUrl = await convexClient.mutation(api.files.generateUploadUrl, {})
  let responseBody: string

  if (Platform.OS === 'web') {
    const response = await fetch(uri)
    if (!response.ok) throw new Error('Não foi possível ler a foto selecionada')
    const blob = await response.blob()
    responseBody = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', uploadUrl)
      xhr.setRequestHeader(
        'Content-Type',
        mimeType || blob.type || 'image/jpeg',
      )
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total)
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(1)
          resolve(xhr.responseText)
        } else {
          reject(new Error('Não foi possível enviar a foto para o Convex'))
        }
      }
      xhr.onerror = () =>
        reject(new Error('Não foi possível enviar a foto para o Convex'))
      xhr.send(blob)
    })
  } else {
    const task = FileSystem.createUploadTask(
      uploadUrl,
      uri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': mimeType || 'image/jpeg' },
      },
      (data) => {
        if (data.totalBytesExpectedToSend > 0) {
          onProgress?.(data.totalBytesSent / data.totalBytesExpectedToSend)
        }
      },
    )
    const uploadResponse = await task.uploadAsync()
    if (
      !uploadResponse ||
      uploadResponse.status < 200 ||
      uploadResponse.status >= 300
    ) {
      throw new Error('Não foi possível enviar a foto para o Convex')
    }
    onProgress?.(1)
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
