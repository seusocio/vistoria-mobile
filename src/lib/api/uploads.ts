import * as FileSystem from 'expo-file-system/legacy'
import { Platform } from 'react-native'
import { presignUpload } from '@/lib/api/endpoints/default/default'

export interface PresignedUpload {
  key: string
  uploadUrl: string
  method: string
  headers: Record<string, string>
}

/**
 * Keyed by the client-generated `attachmentId` — but the server resolves that
 * id *through the attachment row* to build the storage key, and answers
 * `404 anexo não encontrado` for an id it has never seen. So this call cannot
 * run before that attachment's own `addAttachment` op has left the outbox;
 * `upload-store.ts`'s `isAwaitingAttachmentRow` is the gate that enforces it.
 */
export async function presignAttachmentUpload(
  orgId: string,
  projectId: string,
  attachmentId: string,
  contentType: string,
): Promise<PresignedUpload> {
  const response = await presignUpload(orgId, projectId, { keys: [{ attachmentId, contentType }] })
  const envelope = response as unknown as {
    data: Array<{ key: string; uploadUrl: string; method: string; headers: Record<string, unknown> }>
  }
  const presigned = envelope.data[0]
  if (!presigned) throw new Error('Presign não retornou nenhuma chave de upload')
  return {
    key: presigned.key,
    uploadUrl: presigned.uploadUrl,
    method: presigned.method,
    headers: Object.fromEntries(Object.entries(presigned.headers).map(([name, value]) => [name, String(value)])),
  }
}

/**
 * Replaces `convex/file-storage.ts`'s `uploadImage` — same shape (PUT/POST
 * the local file with progress callbacks), pointed at whatever URL, method,
 * and headers the presign call returned instead of a Convex upload URL. The
 * caller already has the storage key from `presignAttachmentUpload`, so
 * there is nothing to parse out of this response.
 */
export async function uploadAttachmentFile(
  uri: string,
  mimeType: string | undefined,
  presigned: PresignedUpload,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const headers = { ...presigned.headers }
  if (mimeType && !('Content-Type' in headers) && !('content-type' in headers)) {
    headers['Content-Type'] = mimeType
  }

  if (Platform.OS === 'web') {
    const response = await fetch(uri)
    if (!response.ok) throw new Error('Não foi possível ler a foto selecionada')
    const blob = await response.blob()
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open(presigned.method, presigned.uploadUrl)
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value)
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total)
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(1)
          resolve()
        } else {
          reject(new Error('Não foi possível enviar a foto'))
        }
      }
      xhr.onerror = () => reject(new Error('Não foi possível enviar a foto'))
      xhr.send(blob)
    })
    return
  }

  const task = FileSystem.createUploadTask(
    presigned.uploadUrl,
    uri,
    {
      httpMethod: presigned.method as FileSystem.FileSystemUploadOptions['httpMethod'],
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers,
    },
    (data) => {
      if (data.totalBytesExpectedToSend > 0) {
        onProgress?.(data.totalBytesSent / data.totalBytesExpectedToSend)
      }
    },
  )
  const uploadResponse = await task.uploadAsync()
  if (!uploadResponse || uploadResponse.status < 200 || uploadResponse.status >= 300) {
    throw new Error('Não foi possível enviar a foto')
  }
  onProgress?.(1)
}
