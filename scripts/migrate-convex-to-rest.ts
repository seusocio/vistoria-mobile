/**
 * One-off data migration: Convex deployment -> the REST backend.
 *
 * Moves tags, checklists and applications (with their items). Attachments —
 * the rows *and* the image bytes in Convex file storage — are deliberately
 * out of scope here and land in a separate script; this one only has to get
 * the records across, and an application's attachments can be attached to it
 * afterwards in any order.
 *
 * The read side is `convex/exportForMigration.ts` (shared with that later
 * attachment script, which is why its `application` query already resolves
 * download URLs this file ignores). This file is the write side and owns all
 * of the ordering, idempotency and resume logic.
 *
 * It talks to REST with plain `fetch` instead of the generated orval client
 * on purpose: that client's fetcher (`src/lib/api/fetcher.ts`) pulls in the
 * zustand/AsyncStorage session store, which only exists inside the React
 * Native app. The one thing copied from it is how auth actually works on
 * this deployment — a `Cookie: __Secure-better-auth.session_token=<token>`
 * header, not `Authorization: Bearer` (see that file's comment).
 *
 * Usage:
 *   bun scripts/migrate-convex-to-rest.ts --dry-run
 *   bun scripts/migrate-convex-to-rest.ts
 *   bun scripts/migrate-convex-to-rest.ts --only=applications --limit=5
 *
 * Every step is idempotent and checkpointed (`--state`, default
 * `.migration-state.json`): a run that dies — network, expired session,
 * Ctrl-C — is resumed by re-running the same command. Nothing is ever
 * deleted or overwritten on the target; rows that already exist there are
 * skipped, so a partial earlier attempt is safe to run on top of.
 */

import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import {
  type Checkpoint,
  loadCheckpoint,
  parseFlags,
  Rest,
  RestError,
  resolveTarget,
  saveCheckpoint,
  type Target,
  TARGET_FLAGS,
} from './migration-shared'

// ---------------------------------------------------------------- config

interface Options {
  target: Target
  only: Set<Phase>
  limit: number | null
  statePath: string
  dryRun: boolean
  resetState: boolean
}

type Phase = 'tags' | 'checklists' | 'applications'
const PHASES: Phase[] = ['tags', 'checklists', 'applications']

function parseOptions(argv: string[]): Options {
  const flags = parseFlags(argv, [
    ...TARGET_FLAGS,
    'only',
    'limit',
    'state',
    'dry-run',
    'reset-state',
  ])
  if (flags.has('help')) {
    console.log(HELP)
    process.exit(0)
  }

  const only = flags.has('only')
    ? new Set(
        (flags.get('only') as string).split(',').map((phase) => {
          if (!PHASES.includes(phase as Phase)) throw new Error(`--only inválido: ${phase}`)
          return phase as Phase
        }),
      )
    : new Set(PHASES)

  return {
    target: resolveTarget(flags),
    only,
    limit: flags.has('limit') ? Number(flags.get('limit')) : null,
    statePath: flags.get('state') ?? '.migration-state.json',
    dryRun: flags.get('dry-run') === 'true',
    resetState: flags.get('reset-state') === 'true',
  }
}

const HELP = `
Migra os dados (tags, checklists, applications) do Convex para o backend REST.
Anexos ficam de fora — são um script à parte.

  bun scripts/migrate-convex-to-rest.ts [flags]

  --dry-run            Só relata o que faria; nenhuma escrita.
  --only=a,b           Fases a rodar: tags,checklists,applications (padrão: todas).
  --limit=N            Processa no máximo N applications (amostra/teste).
  --state=CAMINHO      Arquivo de checkpoint (padrão: .migration-state.json).
  --reset-state        Começa do zero, ignorando o checkpoint existente.
  --convex-url/--base-url/--token/--org/--project
                       Sobrescrevem os valores lidos do .env.local.
`.trim()

// ---------------------------------------------------------------- state

interface State extends Checkpoint {
  tags: string[]
  checklists: string[]
  applications: string[]
}

// ---------------------------------------------------------------- shapes

interface ConvexTag {
  id: string
  label: string
  normalizedLabel: string
  createdAt: string
  updatedAt: string
}

interface ConvexChecklistItem {
  id: string
  position: number
  title: string
  description: string
  tagsIds: string[]
  parentId?: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

interface ConvexChecklist {
  id: string
  title: string
  tagsIds: string[]
  options: Array<{ label: string; semantic: string }>
  source: 'manual' | 'audio_suggestion'
  items: ConvexChecklistItem[]
}

interface ConvexApplicationItem {
  id: string
  position: number
  checklistItemId?: string | null
  parentId?: string | null
  title: string
  description: string
  answer: string
  answeredAt: string | null
  note: string
  quantity: number | null
  tagsIds: string[]
  suggested: boolean
  suggestionSource: 'transcript' | 'previous_application' | null
  workflowStatus?: 'in_progress' | 'in_review' | 'denied' | null
  createdAt: string
  updatedAt: string
}

interface ConvexApplication {
  id: string
  checklistId: string
  tagsIds: string[]
  date: string
  status: 'draft' | 'completed'
  items: ConvexApplicationItem[]
  gallerySourceApplicationId: string | null
  transcript: string | null
  updatedAt: string
  completedAt: string | null
}

// ---------------------------------------------------------------- report

interface Counts {
  created: number
  skipped: number
}

const report: {
  tags: Counts
  checklists: Counts
  /** `orphaned`: skipped because their checklist isn't on the target — see `migrateApplications`. */
  applications: Counts & { orphaned: number }
  warnings: string[]
} = {
  tags: { created: 0, skipped: 0 },
  checklists: { created: 0, skipped: 0 },
  applications: { created: 0, skipped: 0, orphaned: 0 },
  warnings: [],
}

function warn(message: string): void {
  report.warnings.push(message)
  console.warn(`  ! ${message}`)
}

// ---------------------------------------------------------------- phases

async function migrateTags(rest: Rest, convex: ConvexHttpClient, options: Options, state: State) {
  const source = (await convex.query(api.exportForMigration.tags, {})) as ConvexTag[]
  const existing = new Set((await rest.listAll<{ id: string }>('/tags/')).map((tag) => tag.id))
  console.log(`\ntags: ${source.length} no Convex, ${existing.size} já no destino`)

  for (const tag of source) {
    if (existing.has(tag.id) || state.tags.includes(tag.id)) {
      report.tags.skipped += 1
      continue
    }
    if (options.dryRun) {
      console.log(`  + tag ${tag.id} (${tag.label})`)
      report.tags.created += 1
      continue
    }
    try {
      await rest.post('/tags/', { id: tag.id, label: tag.label })
      report.tags.created += 1
    } catch (error) {
      // A tag whose *label* already exists on the target under a different
      // id is a collision the REST side rejects; there is no delete-tag
      // endpoint to resolve it, so it is reported rather than retried.
      if (error instanceof RestError && error.status === 409) {
        warn(`tag ${tag.id} (${tag.label}): já existe no destino com outro id — não migrada`)
        report.tags.skipped += 1
      } else {
        throw error
      }
    }
    state.tags.push(tag.id)
    await saveCheckpoint(options.statePath, state, options.dryRun)
  }
}

async function migrateChecklists(
  rest: Rest,
  convex: ConvexHttpClient,
  options: Options,
  state: State,
) {
  const source = (await convex.query(api.exportForMigration.checklists, {})) as ConvexChecklist[]
  const existing = new Set((await rest.listAll<{ id: string }>('/checklists/')).map((row) => row.id))
  console.log(`\nchecklists: ${source.length} no Convex, ${existing.size} já no destino`)

  for (const checklist of source) {
    if (existing.has(checklist.id) || state.checklists.includes(checklist.id)) {
      report.checklists.skipped += 1
      continue
    }
    if (options.dryRun) {
      console.log(
        `  + checklist ${checklist.id} (${checklist.title}, ${checklist.items.length} itens)`,
      )
      report.checklists.created += 1
      continue
    }
    // Mirrors `toChecklistBody` in `src/features/checklist/shared/checklist.rest.ts`.
    await rest.post('/checklists/', {
      id: checklist.id,
      title: checklist.title,
      source: checklist.source,
      tagsIds: checklist.tagsIds,
      options: checklist.options,
      items: checklist.items.map((item) => ({
        id: item.id,
        position: item.position,
        title: item.title,
        description: item.description,
        tagsIds: item.tagsIds,
        parentId: item.parentId ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        deletedAt: item.deletedAt,
      })),
    })
    report.checklists.created += 1
    state.checklists.push(checklist.id)
    await saveCheckpoint(options.statePath, state, options.dryRun)
  }
}

async function migrateApplications(
  rest: Rest,
  convex: ConvexHttpClient,
  options: Options,
  state: State,
) {
  const ids = (await convex.query(api.exportForMigration.applicationIds, {})) as Array<{
    id: string
  }>
  const selected = options.limit === null ? ids : ids.slice(0, options.limit)
  const existing = new Set((await rest.listAll<{ id: string }>('/applications')).map((r) => r.id))
  // `POST /applications` 404s (`checklist não encontrada`) for a
  // `checklistId` the target doesn't have, which aborts the whole run. An
  // application can reference a checklist that was soft-deleted in Convex
  // without being cascaded itself, and a soft-deleted checklist is
  // deliberately not migrated (the REST schema has no `deletedAt`, so it
  // would come back as a live row in the Library). Those applications are
  // reported and skipped rather than resurrecting their checklist.
  const checklistIds = new Set(
    (await rest.listAll<{ id: string }>('/checklists/')).map((row) => row.id),
  )
  console.log(
    `\napplications: ${selected.length} a processar (${ids.length} no Convex), ${existing.size} já no destino`,
  )

  for (const [index, summary] of selected.entries()) {
    const label = `[${index + 1}/${selected.length}] ${summary.id}`
    if (existing.has(summary.id) || state.applications.includes(summary.id)) {
      report.applications.skipped += 1
      console.log(`${label}: já existe`)
      continue
    }

    const application = (await convex.query(api.exportForMigration.application, {
      id: summary.id,
    })) as ConvexApplication | null
    if (!application) {
      warn(`application ${summary.id}: sumiu do Convex entre a listagem e a leitura — ignorada`)
      continue
    }

    if (!checklistIds.has(application.checklistId)) {
      warn(
        `application ${application.id}: checklist ${application.checklistId} não existe no destino ` +
          '(apagada no Convex) — não migrada',
      )
      report.applications.orphaned += 1
      continue
    }

    if (options.dryRun) {
      report.applications.created += 1
      console.log(`${label}: + application (${application.items.length} itens)`)
      continue
    }

    // Mirrors `toCreateApplicationBody` in `application.rest.ts`: items go in
    // the create body, attachments are a separate endpoint (and a separate
    // script — see the module doc).
    await rest.post('/applications', {
      id: application.id,
      checklistId: application.checklistId,
      tagsIds: application.tagsIds,
      date: application.date,
      status: application.status,
      transcript: application.transcript,
      gallerySourceApplicationId: application.gallerySourceApplicationId,
      items: application.items.map((item) => ({
        id: item.id,
        checklistItemId: item.checklistItemId ?? null,
        parentId: item.parentId ?? null,
        position: item.position,
        title: item.title,
        description: item.description,
        tagsIds: item.tagsIds,
        answer: item.answer,
        answeredAt: item.answeredAt,
        note: item.note,
        quantity: item.quantity,
        suggested: item.suggested,
        suggestionSource: item.suggestionSource,
        workflowStatus: item.workflowStatus ?? null,
      })),
    })
    report.applications.created += 1
    state.applications.push(application.id)
    await saveCheckpoint(options.statePath, state, options.dryRun)
    console.log(`${label}: + application (${application.items.length} itens)`)
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const { target } = options
  console.log(
    [
      `Convex : ${target.convexUrl}`,
      `REST   : ${target.baseUrl} (org ${target.orgId} / project ${target.projectId})`,
      `Fases  : ${[...options.only].join(', ')}${options.limit === null ? '' : ` (limit ${options.limit})`}`,
      options.dryRun ? 'Modo   : DRY RUN — nada será escrito' : `Estado : ${options.statePath}`,
    ].join('\n'),
  )

  const rest = new Rest(target)
  const convex = new ConvexHttpClient(target.convexUrl)
  const state = await loadCheckpoint<State>(
    options.statePath,
    target,
    () => ({ target: {} as State['target'], tags: [], checklists: [], applications: [] }),
    options.resetState,
  )
  await rest.assertReachable()

  if (options.only.has('tags')) await migrateTags(rest, convex, options, state)
  if (options.only.has('checklists')) await migrateChecklists(rest, convex, options, state)
  if (options.only.has('applications')) await migrateApplications(rest, convex, options, state)
  await saveCheckpoint(options.statePath, state, options.dryRun)

  console.log('\n---------------- resumo ----------------')
  console.log(`tags          criadas ${report.tags.created}, já existiam ${report.tags.skipped}`)
  console.log(
    `checklists    criados ${report.checklists.created}, já existiam ${report.checklists.skipped}`,
  )
  console.log(
    `applications  criadas ${report.applications.created}, já existiam ${report.applications.skipped}` +
      `, órfãs (checklist ausente) ${report.applications.orphaned}`,
  )
  console.log('anexos        migrate-convex-attachments.ts')
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
