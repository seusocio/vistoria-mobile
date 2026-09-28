import { describe, expect, test } from 'bun:test'
import type { Attachment } from '../application.types'
import { resolvePreviewUri } from '../attachment-preview'

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'attachment_1',
    name: 'Foto',
    position: 0,
    createdAt: '2026-09-27T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('resolvePreviewUri', () => {
  test('prefers the local file while the upload is still pending', () => {
    // The server presigns a GET URL the moment the row exists, blob or not —
    // trusting it here is what rendered a broken thumbnail mid-upload.
    const uri = resolvePreviewUri(
      attachment({ uploadStatus: 'pending', url: 'https://storage/pending.jpeg?sig' }),
      { attachment_1: 'file:///uploads/a.jpg' },
    )
    expect(uri).toBe('file:///uploads/a.jpg')
  })

  test('falls back to the upload queue once the addAttachment op has drained', () => {
    // No `localUri` on the entity anymore: the overlay stopped re-applying the
    // op that carried it. The queue still knows where the file is.
    const uri = resolvePreviewUri(attachment({ uploadStatus: 'pending' }), {
      attachment_1: 'file:///uploads/a.jpg',
    })
    expect(uri).toBe('file:///uploads/a.jpg')
  })

  test('uses the server URL once uploaded, when the local file is gone', () => {
    const uri = resolvePreviewUri(
      attachment({ uploadStatus: 'uploaded', url: 'https://storage/a.jpeg?sig' }),
      {},
    )
    expect(uri).toBe('https://storage/a.jpeg?sig')
  })

  test('uses the server URL for a pending photo this device has no file for', () => {
    const uri = resolvePreviewUri(
      attachment({ uploadStatus: 'pending', url: 'https://storage/a.jpeg?sig' }),
      {},
    )
    expect(uri).toBe('https://storage/a.jpeg?sig')
  })

  test('is undefined when there is neither a URL nor a local file', () => {
    expect(resolvePreviewUri(attachment({ uploadStatus: 'pending' }), {})).toBeUndefined()
  })
})
