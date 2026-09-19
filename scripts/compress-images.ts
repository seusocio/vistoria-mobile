#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Re-encodes every attachment already stored in Convex to WebP and swaps it
 * in place, using only the mutations the app itself already uses for
 * uploads (files.generateUploadUrl, applications.setAttachmentUploaded,
 * files.remove) — no changes to convex/ needed.
 *
 * Usage: bun scripts/compress-images.ts [--dry-run]
 */
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'

const MAX_DIMENSION = 1280
const QUALITY = 70
const DRY_RUN = process.argv.includes('--dry-run')

const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL
if (!CONVEX_URL) throw new Error('Missing EXPO_PUBLIC_CONVEX_URL (or CONVEX_URL) in the environment')

const client = new ConvexHttpClient(CONVEX_URL)

let bytesBefore = 0
let bytesAfter = 0
let processed = 0
let skipped = 0

async function compressAttachment(
  applicationId: string,
  attachment: { id: string; storageId?: string; url?: string },
) {
  if (!attachment.storageId || !attachment.url) return

  const response = await fetch(attachment.url)
  if (!response.ok) {
    console.error(`  skip ${attachment.id}: fetch failed (${response.status})`)
    skipped++
    return
  }
  const original = new Uint8Array(await response.arrayBuffer())

  const compressed = await new Bun.Image(original)
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .buffer()

  if (compressed.byteLength >= original.byteLength) {
    console.log(`  skip ${attachment.id}: already smaller (${original.byteLength}b)`)
    skipped++
    return
  }

  bytesBefore += original.byteLength
  bytesAfter += compressed.byteLength
  console.log(`  ${attachment.id}: ${original.byteLength}b -> ${compressed.byteLength}b`)
  processed++

  if (DRY_RUN) return

  const uploadUrl = await client.mutation(api.files.generateUploadUrl, {})
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'image/webp' },
    body: compressed as BodyInit,
  })
  if (!uploadResponse.ok) throw new Error(`upload failed: ${uploadResponse.status}`)
  const { storageId: newStorageId } = (await uploadResponse.json()) as { storageId: string }

  const oldStorageId = attachment.storageId
  await client.mutation(api.applications.setAttachmentUploaded, {
    applicationId,
    attachmentId: attachment.id,
    storageId: newStorageId,
    updatedAt: new Date().toISOString(),
  })
  await client.mutation(api.files.remove, { storageId: oldStorageId })
}

async function run() {
  console.log(`Connecting to ${CONVEX_URL}${DRY_RUN ? ' (dry run)' : ''}`)
  const applications = await client.query(api.applications.listAll, {})

  for (const application of applications) {
    const full = await client.query(api.applications.findById, { id: application.id })
    if (!full) continue

    console.log(`${full.id}`)
    for (const attachment of full.attachments) {
      await compressAttachment(full.id, attachment)
    }
    for (const item of full.items) {
      for (const attachment of item.attachments) {
        await compressAttachment(full.id, attachment)
      }
    }
  }

  console.log('')
  console.log(DRY_RUN ? 'Dry run complete' : 'Done')
  console.log(`  processed: ${processed}, skipped: ${skipped}`)
  console.log(`  before: ${(bytesBefore / 1024 / 1024).toFixed(2)} MB`)
  console.log(`  after:  ${(bytesAfter / 1024 / 1024).toFixed(2)} MB`)
  console.log(`  saved:  ${((bytesBefore - bytesAfter) / 1024 / 1024).toFixed(2)} MB`)
}

run()
