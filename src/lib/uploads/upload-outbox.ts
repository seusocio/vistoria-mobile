import { useOutbox } from '@/lib/offline-queue'

/*
 * What the upload queue needs to know about the outbox: whether a given
 * attachment still has one of its ops waiting there.
 */

/**
 * `markedFailed` only lives as long as the JS module — a relaunch (or a Fast
 * Refresh in dev) forgets it, and every recovery pass then queued another
 * identical "failed" op for the same photo. The outbox itself is the durable
 * answer to "already reported".
 */
export function hasPendingFailedStatusOp(attachmentId: string): boolean {
  return useOutbox
    .getState()
    .items.some(
      (item) =>
        item.type === 'applications.setAttachmentUploadStatus' &&
        (item.args as { attachmentId?: string }).attachmentId === attachmentId,
    )
}

/**
 * True while this photo's own `addAttachment` op is still sitting in the
 * outbox — i.e. the server does not have its row yet.
 *
 * `POST /uploads/presign` resolves the storage key *from the attachment row*
 * and answers `404 anexo não encontrado` for an id it doesn't know (verified
 * live), so an upload that starts before that op lands fails. Both are
 * enqueued in the same breath by `use-attach-photos.ts`'s `commitAsset`.
 *
 * This deliberately does *not* gate `drainQueue`. Holding the job back until
 * the row exists reads like the obvious fix and is a trap: the outbox is
 * strictly FIFO, so a single unsendable op at its head stops every write
 * behind it indefinitely — and a photo whose `addAttachment` is stuck behind
 * that head would then sit in an upload spinner forever, with no failure to
 * retry and nothing on screen to explain it. Letting the upload attempt and
 * fail is the recoverable shape: the job stays in the persisted queue, the
 * photo shows as failed, and the subscription in
 * `subscribeToUploadRecovery` re-arms it the moment the row does land.
 */
export function isAwaitingAttachmentRow(attachmentId: string): boolean {
  return useOutbox
    .getState()
    .items.some(
      (item) =>
        item.type === 'applications.addAttachment' &&
        (item.args as { attachment?: { id?: string } }).attachment?.id === attachmentId,
    )
}
