/**
 * Second half of the Convex -> REST migration: the attachments.
 *
 * `migrate-convex-to-rest.ts` moved the records; this moves the photos —
 * each attachment's row *and* the image bytes sitting in Convex file storage.
 * It only ever touches applications that are already on the target, so it can
 * be re-run at any time after the records land.
 *
 * Per attachment the order is forced by the API: create the row, presign,
 * download from Convex, upload, confirm. Presign is keyed by `attachmentId`
 * and resolves it *through* the attachment row to build the storage key, so
 * it 404s (`anexo não encontrado`) for an id the server has never seen — the
 * same constraint the app's `upload-store.ts` gates on with
 * `isAwaitingAttachmentRow`. The closing `PATCH uploadStatus: 'uploaded'`
 * mirrors `updateAttachmentUploadStatusRest`: until it lands the row stays
 * `pending` and the app treats the photo as still in flight.
 *
 * Usage:
 *   bun scripts/migrate-convex-attachments.ts --dry-run
 *   bun scripts/migrate-convex-attachments.ts --limit=1     # uma vistoria, ponta a ponta
 *   bun scripts/migrate-convex-attachments.ts
 *
 * Idempotent and checkpointed (`--state`, default
 * `.migration-attachments-state.json`): a run that dies is resumed by
 * re-running the same command. Nothing is ever deleted on the target.
 */

import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import {
  type Checkpoint,
  loadCheckpoint,
  MAX_ATTEMPTS,
  parseFlags,
  pooled,
  Rest,
  resolveTarget,
  saveCheckpoint,
  sleep,
  type Target,
  TARGET_FLAGS,
} from './migration-shared'

// ---------------------------------------------------------------- config

interface Options {
  target: Target
  verify: boolean
  limit: number | null
  concurrency: number
  statePath: string
  dryRun: boolean
  resetState: boolean
}

const HELP = `
Migra os anexos (linha + imagem) do Convex para o backend REST.
Rode depois de migrate-convex-to-rest.ts.

  bun scripts/migrate-convex-attachments.ts [flags]

  --dry-run            Só relata o que faria; nenhuma escrita.
  --verify             Confere os bytes de cada anexo já marcado como enviado e
                       reenvia o que não estiver de fato no storage.
  --limit=N            Processa no máximo N applications (amostra/teste).
  --concurrency=N      Anexos em paralelo por application (padrão: 4).
  --state=CAMINHO      Checkpoint (padrão: .migration-attachments-state.json).
  --reset-state        Começa do zero, ignorando o checkpoint existente.
  --convex-url/--base-url/--token/--org/--project
                       Sobrescrevem os valores lidos do .env.local.
`.trim()

function parseOptions(argv: string[]): Options {
  const flags = parseFlags(argv, [
    ...TARGET_FLAGS,
    'verify',
    'limit',
    'concurrency',
    'state',
    'dry-run',
    'reset-state',
  ])
  if (flags.has('help')) {
    console.log(HELP)
    process.exit(0)
  }
  return {
    target: resolveTarget(flags),
    verify: flags.get('verify') === 'true',
    limit: flags.has('limit') ? Number(flags.get('limit')) : null,
    concurrency: flags.has('concurrency') ? Number(flags.get('concurrency')) : 4,
    statePath: flags.get('state') ?? '.migration-attachments-state.json',
    dryRun: flags.get('dry-run') === 'true',
    resetState: flags.get('reset-state') === 'true',
  }
}

// ---------------------------------------------------------------- state

/**
 * `row` means the attachment record exists on the target but its bytes do
 * not — the state a run interrupted between the POST and the upload leaves
 * behind, and the one a resumed run has to finish rather than skip.
 * `no-bytes` is terminal: there is nothing in Convex storage to upload.
 */
type Stage = 'row' | 'uploaded' | 'no-bytes'

interface State extends Checkpoint {
  /** applicationId -> attachmentId -> how far that attachment got. */
  applications: Record<string, Record<string, Stage>>
}

// ---------------------------------------------------------------- shapes

interface ConvexAttachment {
  id: string
  name: string
  position: number
  createdAt: string
  storageId?: string
  uploadStatus?: 'pending' | 'uploaded' | 'failed'
  mimeType?: string
  width?: number
  height?: number
  /** Resolved by `convex/exportForMigration.ts`; `null` when the photo never finished uploading to Convex. */
  url: string | null
}

interface ConvexApplication {
  id: string
  attachments: ConvexAttachment[]
  items: Array<{ id: string; attachments: ConvexAttachment[] }>
}

interface PresignedPut {
  key: string
  uploadUrl: string
  method: string
  headers: Record<string, string>
}

// ---------------------------------------------------------------- report

const report = {
  rows: 0,
  uploaded: 0,
  alreadyDone: 0,
  repaired: 0,
  noBytes: 0,
  bytes: 0,
  warnings: [] as string[],
}

function warn(message: string): void {
  report.warnings.push(message)
  console.warn(`  ! ${message}`)
}

// ---------------------------------------------------------------- upload

/**
 * The presigned PUT goes straight to object storage, outside `Rest` and its
 * retry — but it is the step most exposed to a transient network fault (it is
 * the only one carrying a megabyte-sized body), so it gets the same treatment.
 */
async function putBytes(presigned: PresignedPut, bytes: ArrayBuffer, contentType: string) {
  const headers = { ...presigned.headers }
  if (!Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = contentType
  }
  let last = ''
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(2 ** (attempt - 1) * 1000)
    try {
      const response = await fetch(presigned.uploadUrl, {
        method: presigned.method,
        headers,
        body: bytes,
      })
      if (response.ok) return
      last = `${response.status} ${await response.text()}`
      if (response.status < 500) break
    } catch (error) {
      last = (error as Error).message
    }
  }
  throw new Error(`Upload para o storage falhou: ${last}`)
}

/**
 * Whether the bytes are really in object storage under this row's key.
 *
 * `uploadStatus: 'uploaded'` is the server's record of a confirmation call
 * having succeeded, not proof the object survived — a row can carry
 * `uploaded` and the correct `sizeBytes` while a `GET` on its own `url`
 * answers S3's `NoSuchKey`. That is not hypothetical: it is exactly what an
 * earlier interrupted run left behind, and trusting the flag is what made a
 * later run skip the broken row instead of repairing it. So `--verify`
 * compares what the target actually serves against what Convex has.
 */
async function bytesPresent(restUrl: string | null | undefined, convexUrl: string): Promise<boolean> {
  if (!restUrl) return false
  const [mine, theirs] = await Promise.all([
    fetch(restUrl, { method: 'HEAD' }).catch(() => null),
    fetch(convexUrl, { method: 'HEAD' }).catch(() => null),
  ])
  if (!mine?.ok || !theirs?.ok) return false
  const size = (response: Response) => response.headers.get('content-length')
  // A storage error page answers 200 with an XML body on some providers, so
  // the size comparison — not the status — is what actually decides.
  return size(mine) !== null && size(mine) === size(theirs)
}

/** One attachment, from wherever a previous run left it to `uploaded`. */
async function migrateAttachment(
  rest: Rest,
  options: Options,
  applicationId: string,
  itemId: string | null,
  attachment: ConvexAttachment,
  stage: Stage | undefined,
): Promise<Stage> {
  const contentType = attachment.mimeType ?? 'image/jpeg'

  if (stage === undefined) {
    if (options.dryRun) {
      report.rows += 1
    } else {
      // Mirrors `toAddAttachmentBody` in `application.rest.ts`. The endpoint
      // takes a batch; one photo at a time keeps a failure attributable to a
      // single attachment.
      await rest.post(`/applications/${applicationId}/attachments`, {
        attachments: [
          {
            id: attachment.id,
            itemId,
            name: attachment.name,
            mimeType: attachment.mimeType ?? null,
            position: attachment.position,
            width: attachment.width ?? null,
            height: attachment.height ?? null,
          },
        ],
      })
      report.rows += 1
    }
  }

  // No `storageId` in Convex means the photo never finished uploading there —
  // the row migrates, the bytes don't exist to migrate.
  if (!attachment.url) {
    report.noBytes += 1
    warn(`anexo ${attachment.id} (application ${applicationId}): sem arquivo no Convex — só a linha`)
    return 'no-bytes'
  }

  if (options.dryRun) {
    report.uploaded += 1
    return 'uploaded'
  }

  const download = await fetch(attachment.url)
  if (!download.ok) {
    throw new Error(`Download do Convex falhou (${download.status}) para o anexo ${attachment.id}`)
  }
  const bytes = await download.arrayBuffer()

  const { data: presigned } = await rest.post<PresignedPut[]>('/uploads/presign', {
    keys: [{ attachmentId: attachment.id, contentType }],
  })
  const target = presigned[0]
  if (!target) throw new Error(`Presign não retornou chave para o anexo ${attachment.id}`)

  await putBytes(target, bytes, contentType)
  await rest.patch(`/attachments/${attachment.id}`, { uploadStatus: 'uploaded' })

  report.uploaded += 1
  report.bytes += bytes.byteLength
  return 'uploaded'
}

// ---------------------------------------------------------------- main

function formatBytes(total: number): string {
  if (total < 1024 * 1024) return `${(total / 1024).toFixed(0)} KB`
  return `${(total / 1024 / 1024).toFixed(1)} MB`
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const { target } = options
  console.log(
    [
      `Convex : ${target.convexUrl}`,
      `REST   : ${target.baseUrl} (org ${target.orgId} / project ${target.projectId})`,
      options.limit === null
        ? 'Escopo : todas as applications'
        : `Escopo : ${options.limit} application(s)`,
      options.verify ? 'Verify : confere os bytes de tudo que já está marcado como enviado' : '',
      options.dryRun ? 'Modo   : DRY RUN — nada será escrito' : `Estado : ${options.statePath}`,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  const rest = new Rest(target)
  const convex = new ConvexHttpClient(target.convexUrl)
  const state = await loadCheckpoint<State>(
    options.statePath,
    target,
    () => ({ target: {} as State['target'], applications: {} }),
    options.resetState,
  )
  await rest.assertReachable()

  // Attachments can only hang off an application that already exists on the
  // target, so the server's own list — not Convex's — decides what is in
  // scope. `include=attachments` is what makes a re-run after a lost
  // checkpoint still correct: it reports which rows are already there.
  type ServerAttachment = { id: string; uploadStatus?: string; url?: string | null }
  const onTarget = await rest.listAll<{
    id: string
    attachments?: ServerAttachment[]
    items?: Array<{ attachments?: ServerAttachment[] }>
  }>('/applications', { include: 'items,attachments' })

  const serverRow = new Map<string, ServerAttachment>()
  for (const application of onTarget) {
    const rows = [
      ...(application.attachments ?? []),
      ...(application.items ?? []).flatMap((item) => item.attachments ?? []),
    ]
    for (const row of rows) serverRow.set(row.id, row)
  }
  const serverStage = (id: string): Stage | undefined => {
    const row = serverRow.get(id)
    if (!row) return undefined
    return row.uploadStatus === 'uploaded' ? 'uploaded' : 'row'
  }

  const ids = (await convex.query(api.exportForMigration.applicationIds, {})) as Array<{
    id: string
  }>
  const migrated = new Set(onTarget.map((application) => application.id))
  const inScope = ids.filter((summary) => migrated.has(summary.id))
  const skipped = ids.length - inScope.length
  const selected = options.limit === null ? inScope : inScope.slice(0, options.limit)
  console.log(
    `\napplications: ${selected.length} a varrer` +
      `${skipped > 0 ? ` (${skipped} do Convex ainda não estão no destino — ignoradas)` : ''}`,
  )

  for (const [index, summary] of selected.entries()) {
    const application = (await convex.query(api.exportForMigration.application, {
      id: summary.id,
    })) as ConvexApplication | null
    if (!application) continue

    state.applications[application.id] ??= {}
    const tracked = state.applications[application.id] as Record<string, Stage>
    const all = [
      ...application.attachments.map((attachment) => ({ itemId: null, attachment })),
      ...application.items.flatMap((item) =>
        item.attachments.map((attachment) => ({ itemId: item.id, attachment })),
      ),
    ]
    if (all.length === 0) continue

    // The checkpoint is the fast path; the server's own view is the
    // authority when the checkpoint has nothing to say about a row.
    for (const { attachment } of all) {
      tracked[attachment.id] ??= serverStage(attachment.id) as Stage
    }

    // `--verify` demotes any row whose bytes aren't actually being served
    // back to `row`, so the pass below re-uploads it — see `bytesPresent`.
    if (options.verify) {
      await pooled(all, options.concurrency, async ({ attachment }) => {
        if (tracked[attachment.id] !== 'uploaded' || !attachment.url) return
        if (await bytesPresent(serverRow.get(attachment.id)?.url, attachment.url)) return
        warn(`anexo ${attachment.id}: marcado como enviado mas sem bytes no storage — reenviando`)
        report.repaired += 1
        tracked[attachment.id] = 'row'
      })
    }

    const pending = all.filter(({ attachment }) => {
      const stage = tracked[attachment.id]
      if (stage === 'uploaded' || stage === 'no-bytes') {
        report.alreadyDone += 1
        return false
      }
      return true
    })

    const label = `[${index + 1}/${selected.length}] ${application.id}`
    if (pending.length === 0) {
      console.log(`${label}: ${all.length} anexo(s), nada a fazer`)
      continue
    }
    console.log(`${label}: ${pending.length} de ${all.length} anexo(s) pendente(s)`)

    await pooled(pending, options.concurrency, async ({ itemId, attachment }) => {
      tracked[attachment.id] = await migrateAttachment(
        rest,
        options,
        application.id,
        itemId,
        attachment,
        tracked[attachment.id],
      )
    })
    await saveCheckpoint(options.statePath, state, options.dryRun)
  }
  await saveCheckpoint(options.statePath, state, options.dryRun)

  console.log('\n---------------- resumo ----------------')
  console.log(`linhas criadas      ${report.rows}`)
  console.log(`imagens enviadas    ${report.uploaded} (${formatBytes(report.bytes)})`)
  console.log(`já estavam prontos  ${report.alreadyDone}`)
  if (options.verify) console.log(`reparados           ${report.repaired}`)
  console.log(`sem bytes no Convex ${report.noBytes}`)
  if (report.warnings.length > 0) {
    console.log(`\n${report.warnings.length} aviso(s):`)
    for (const message of report.warnings) console.log(`  ! ${message}`)
  }
  if (options.dryRun) console.log('\nDRY RUN — nenhuma escrita foi feita.')
}

main().catch((error) => {
  console.error('\nMigração interrompida:', error instanceof Error ? error.message : error)
  console.error('O checkpoint foi salvo — rode o mesmo comando de novo para continuar de onde parou.')
  process.exit(1)
})
