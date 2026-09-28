import type { Attachment } from '@/features/application/shared/application.types'

/**
 * Which URI a photo's thumbnail/viewer should load.
 *
 * The REST backend hands back a presigned GET `url` for an attachment as soon
 * as its row exists — including while its blob is still uploading, when that
 * URL 404s. So a photo that hasn't finished uploading has to prefer the local
 * file, and only fall back to `url` when there is no local copy (a photo
 * uploaded from another device, or one whose upload-queue entry this install
 * never had).
 *
 * `localUris` is `useLocalUploadUris()` (`upload-store.ts`), and it is what
 * makes this survive the op draining: `attachment.localUri` only exists while
 * the overlay is still re-applying this photo's own pending `addAttachment`
 * op, and disappears the moment that op lands — leaving nothing but a `url`
 * whose blob may not be in storage yet. Kept a pure function of its two
 * inputs so it can be tested without pulling the store (and, through it,
 * react-native) into the test runner.
 */
export function resolvePreviewUri(
  attachment: Attachment,
  localUris: Record<string, string>,
): string | undefined {
  const localUri = attachment.localUri ?? localUris[attachment.id]
  if (attachment.uploadStatus !== 'uploaded' && localUri) return localUri
  return attachment.url ?? localUri
}
