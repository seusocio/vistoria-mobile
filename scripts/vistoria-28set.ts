/**
 * Fecha as vistorias antigas e abre a visita de 28/09 a partir de `28-setp.csv`.
 *
 * Dois subcomandos, pensados para rodar nessa ordem:
 *
 *   bun scripts/vistoria-28set.ts complete-drafts [--dry-run]
 *     Marca como `completed` todo application em rascunho da checklist de
 *     vistoria de apartamentos anterior à data da nova visita.
 *
 *   bun scripts/vistoria-28set.ts create [--dry-run]
 *     Cria um application (rascunho) por apartamento da planilha, com as
 *     respostas que a planilha cobre. O que ela não cobre vem da visita
 *     anterior marcado como `suggested` — igual ao "repetir vistoria" do app
 *     (`buildRepeatedApplication` em `application.utils.ts`) — e sai listado
 *     no relatório final como NÃO validado por esta planilha.
 *
 * Fala REST com `fetch` puro pelo mesmo motivo dos scripts de migração: o
 * client do orval depende da session store do React Native. Ver
 * `scripts/migration-shared.ts`.
 */

import { type Flags, parseFlags, Rest, resolveTarget, TARGET_FLAGS } from './migration-shared'

// ---------------------------------------------------------------- planilha

/**
 * As sete colunas da planilha, na ordem em que aparecem depois de `andar` e
 * `TIPO`, cada uma apontando para um grupo de itens da checklist. A legenda do
 * arquivo lista seis siglas e o cabeçalho tem sete — `S` (Shaft) é a que falta
 * lá, e é a única leitura que fecha com os 30 itens da checklist.
 */
interface Column {
  code: string
  legend: string
  /** Casa com `title.startsWith(prefix)` — o grupo inteiro recebe a resposta. */
  prefix?: string
  /** Casa com o título exato (grupos de um item só). */
  exact?: string
}

const COLUMNS: Column[] = [
  { code: 'I', legend: 'IMPERMEABILIZACAO', prefix: 'Impermeabilização:' },
  { code: 'B', legend: 'BASE SHAFT', prefix: 'Base shaft:' },
  { code: 'F', legend: 'FORRO', prefix: 'Forro gesso:' },
  { code: 'L', legend: 'LIXA', exact: 'Lixa parede' },
  { code: 'S', legend: 'SHAFT', prefix: 'Shaft:' },
  { code: 'P', legend: 'PAREDE', prefix: 'Parede Lavanderia' },
  { code: 'C', legend: 'CONTRAMARCO', prefix: 'Contramarco:' },
]

/** `o`/`x`/`e` da legenda -> os rótulos das opções da checklist. */
const ANSWER_BY_MARK: Record<string, string> = {
  o: 'Sim', // feito
  x: 'Não', // nao feito
  e: 'Parcial', // em execucao
}

/**
 * Abreviações de cômodo que aparecem dentro de uma célula. Uma célula com
 * lista (só a coluna B tem) nomeia os cômodos que **faltam**: conferido contra
 * a visita de 24/09, onde `wc` no APT-42, `wc,wcs` no APT-43 e `coz,wc,wcs` no
 * APT-45 reproduzem exatamente as respostas já gravadas lá.
 */
const ROOM_BY_TOKEN: Record<string, string> = {
  coz: 'cozinha',
  wc: 'wc',
  wcs: 'wcs',
  chur: 'churrasqueira',
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()

interface Row {
  floor: number
  type: number
  /** Rótulo da tag do apartamento: andar + tipo (`4` + `2` -> `APT-42`). */
  apartment: string
  cells: Map<string, string>
}

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  const [header, ...body] = lines
  const columns = (header as string).split(';').slice(2, 2 + COLUMNS.length)
  for (const [index, column] of COLUMNS.entries()) {
    if (columns[index] !== column.code) {
      throw new Error(
        `Cabeçalho inesperado na coluna ${index + 3}: "${columns[index]}" (esperava "${column.code}")`,
      )
    }
  }

  const rows: Row[] = []
  let floor = 0
  for (const [index, line] of body.entries()) {
    const fields = line.split(';')
    // O andar só aparece na primeira das seis linhas do bloco.
    if (fields[0]?.trim()) floor = Number(fields[0])
    const type = Number(fields[1])
    if (!floor || !type) throw new Error(`Linha ${index + 2} sem andar/tipo: "${line}"`)
    const cells = new Map<string, string>()
    for (const [offset, column] of COLUMNS.entries()) {
      cells.set(column.code, (fields[2 + offset] ?? '').trim())
    }
    rows.push({ floor, type, apartment: `APT-${floor}${type}`, cells })
  }
  return rows
}

// ---------------------------------------------------------------- backend

interface ChecklistItem {
  id: string
  title: string
  description: string
  position: number
  tagsIds: string[]
  deletedAt: string | null
}

interface Checklist {
  id: string
  title: string
  items: ChecklistItem[]
}

interface ApplicationItem {
  id: string
  checklistItemId: string | null
  parentId: string | null
  position: number
  title: string
  description: string
  tagsIds: string[]
  answer: string
  answeredAt: string | null
  note: string
  quantity: number | null
  suggested: boolean
  suggestionSource: string | null
  workflowStatus: string | null
}

interface Application {
  id: string
  checklistId: string
  tagsIds: string[]
  date: string
  status: 'draft' | 'completed'
  items: ApplicationItem[]
}

interface Tag {
  id: string
  label: string
  normalizedLabel: string
}

const CHECKLIST_TITLE = 'vistoria de apartamentos'

async function loadChecklist(rest: Rest): Promise<Checklist> {
  const checklists = await rest.listAll<Checklist>('/checklists')
  const match = checklists.filter((c) => normalize(c.title ?? '') === CHECKLIST_TITLE)
  if (match.length !== 1) {
    throw new Error(
      `Esperava exatamente uma checklist "${CHECKLIST_TITLE}", achei ${match.length} ` +
        `(de ${checklists.length}: ${checklists.map((c) => c.title).join(', ')})`,
    )
  }
  return match[0] as Checklist
}

/** Uma entrada de id gerado do jeito que `src/lib/id.ts` gera. */
const generateId = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

// ---------------------------------------------------------------- flags

interface Options {
  dryRun: boolean
  csvPath: string
  date: string
  carryOver: boolean
  inspect: string | null
}

const OWN_FLAGS = ['dry-run', 'csv', 'date', 'no-carry-over', 'inspect']

const USAGE = `
Uso: bun scripts/vistoria-28set.ts <complete-drafts|create> [flags]

  complete-drafts   Fecha (status=completed) os rascunhos anteriores à visita.
  create            Cria a visita nova, em rascunho, a partir do CSV.

Flags:
  --dry-run         Não escreve nada; só mostra o que faria.
  --csv=CAMINHO     Planilha (padrão: 28-setp.csv).
  --date=ISO        Data da visita nova (padrão: 2026-09-28T12:00:00.000Z).
  --no-carry-over   Não traz as respostas da visita anterior nos itens que o
                    CSV não cobre — deixa em branco.
  --inspect=APT-42  Só monta esse apartamento e imprime os itens, para conferir
                    a leitura da planilha antes de escrever.
  ${TARGET_FLAGS.map((f) => `--${f}`).join(' ')}
`

function parseOptions(argv: string[]): {
  command: string
  options: Options
  flags: Flags
} {
  const [command, ...rest] = argv
  if (!command || command.startsWith('--')) throw new Error(`Falta o subcomando.\n${USAGE}`)
  if (command !== 'complete-drafts' && command !== 'create') {
    throw new Error(`Subcomando desconhecido: ${command}\n${USAGE}`)
  }
  const flags = parseFlags(rest, [...OWN_FLAGS, ...TARGET_FLAGS])
  return {
    command,
    flags,
    options: {
      dryRun: flags.get('dry-run') === 'true',
      csvPath: flags.get('csv') ?? '28-setp.csv',
      date: flags.get('date') ?? '2026-09-28T12:00:00.000Z',
      carryOver: flags.get('no-carry-over') !== 'true',
      inspect: flags.get('inspect') ?? null,
    },
  }
}

// ---------------------------------------------------------------- comandos

/**
 * Fecha todo rascunho da checklist **anterior** à nova visita. O corte por
 * data é o que deixa o script rodar de novo depois do `create` sem fechar a
 * visita de 28/09 que ele mesmo abriu em rascunho.
 */
async function completeDrafts(rest: Rest, options: Options) {
  const checklist = await loadChecklist(rest)
  const applications = await rest.listAll<Application>('/applications')
  const drafts = applications.filter(
    (a) => a.checklistId === checklist.id && a.status === 'draft' && a.date < options.date,
  )
  console.log(
    `\ncomplete-drafts: ${drafts.length} rascunho(s) anteriores a ${options.date} ` +
      `(de ${applications.length} applications)`,
  )
  for (const [index, application] of drafts.entries()) {
    const label = `[${index + 1}/${drafts.length}] ${application.id} ${application.date.slice(0, 10)}`
    if (options.dryRun) {
      console.log(`${label}: draft -> completed (dry run)`)
      continue
    }
    await rest.patch(`/applications/${application.id}`, {
      status: 'completed',
    })
    console.log(`${label}: draft -> completed`)
  }
  return drafts.length
}

/** O que a planilha não conseguiu responder, para o relatório do fim. */
interface Gap {
  scope: string
  reason: string
}

async function create(rest: Rest, options: Options) {
  const csv = await Bun.file(options.csvPath).text()
  const rows = parseCsv(csv)
  const checklist = await loadChecklist(rest)
  const items = checklist.items
    .filter((item) => !item.deletedAt)
    .sort((a, b) => a.position - b.position)
  const tags = await rest.listAll<Tag>('/tags')
  const tagByLabel = new Map(tags.map((tag) => [normalize(tag.label), tag]))
  const applications = await rest.listAll<Application>('/applications')

  const gaps: Gap[] = []

  // ---- quais itens da checklist cada coluna cobre
  const columnOf = new Map<string, Column>()
  for (const item of items) {
    const column = COLUMNS.find((c) =>
      c.exact ? item.title.trim() === c.exact : item.title.startsWith(c.prefix as string),
    )
    if (column) columnOf.set(item.id, column)
  }
  const uncovered = items.filter((item) => !columnOf.has(item.id))
  for (const item of uncovered) {
    gaps.push({
      scope: `checklist · ${item.title}`,
      reason: 'nenhuma coluna da planilha cobre este item',
    })
  }

  // ---- índice da visita anterior de cada apartamento
  const latestByTag = new Map<string, Application>()
  for (const application of applications) {
    if (application.checklistId !== checklist.id) continue
    if (application.date >= options.date) continue
    for (const tagId of application.tagsIds) {
      const current = latestByTag.get(tagId)
      if (!current || current.date < application.date) latestByTag.set(tagId, application)
    }
  }

  const alreadyCreated = new Set(
    applications
      .filter(
        (a) => a.checklistId === checklist.id && a.date.slice(0, 10) === options.date.slice(0, 10),
      )
      .flatMap((a) => a.tagsIds),
  )

  console.log(`\ncreate: ${rows.length} apartamento(s) na planilha, visita ${options.date}`)
  let created = 0
  let skipped = 0

  for (const row of rows) {
    if (options.inspect && normalize(options.inspect) !== normalize(row.apartment)) continue
    const tag = tagByLabel.get(normalize(row.apartment))
    if (!tag) {
      gaps.push({
        scope: row.apartment,
        reason: 'apartamento sem tag no projeto — não criado',
      })
      console.log(`${row.apartment}: sem tag — pulado`)
      continue
    }
    if (alreadyCreated.has(tag.id)) {
      skipped += 1
      console.log(
        `${row.apartment}: já existe application em ${options.date.slice(0, 10)} — pulado`,
      )
      continue
    }

    // `GET /applications` devolve as linhas sem `items` — os itens da visita
    // anterior só vêm no detalhe.
    const summary = latestByTag.get(tag.id)
    const previous = summary
      ? (await rest.get<Application>(`/applications/${summary.id}`)).data
      : undefined
    const previousByChecklistItemId = new Map(
      (previous?.items ?? [])
        .filter((item) => item.checklistItemId)
        .map((item) => [item.checklistItemId as string, item]),
    )
    if (!previous) {
      gaps.push({
        scope: row.apartment,
        reason: 'sem visita anterior — itens fora da planilha ficaram em branco',
      })
    }

    const now = new Date().toISOString()
    const applicationItems: ApplicationItem[] = items.map((item) => {
      const base: ApplicationItem = {
        id: generateId('aitem_'),
        checklistItemId: item.id,
        parentId: null,
        position: item.position,
        title: item.title,
        description: item.description,
        tagsIds: [...item.tagsIds],
        answer: '',
        answeredAt: null,
        note: '',
        quantity: null,
        suggested: false,
        suggestionSource: null,
        workflowStatus: null,
      }

      const column = columnOf.get(item.id)
      const resolved = column
        ? resolveAnswer(row, column, item, gaps)
        : { answer: null as string | null, note: undefined }

      if (resolved.answer !== null) {
        // A planilha respondeu: resposta firme, não sugestão.
        return {
          ...base,
          answer: resolved.answer,
          answeredAt: options.date,
          note: resolved.note ?? '',
        }
      }

      if (resolved.note !== undefined) return { ...base, note: resolved.note }

      // A planilha não respondeu: herda a visita anterior como sugestão, do
      // mesmo jeito que `buildRepeatedApplication` faz no app.
      const carried = options.carryOver ? previousByChecklistItemId.get(item.id) : undefined
      if (!carried?.answer) return base
      return {
        ...base,
        tagsIds: [...carried.tagsIds],
        answer: carried.answer,
        note: carried.note,
        quantity: carried.quantity,
        suggested: true,
        suggestionSource: 'previous_application',
        answeredAt: now,
      }
    })

    if (options.inspect) {
      console.log(
        `\n${row.apartment} (tipo ${row.type}) — planilha: ${[...row.cells].map(([c, v]) => `${c}=${v || '∅'}`).join(' ')}`,
      )
      for (const item of applicationItems) {
        const origin = item.suggested ? 'anterior' : item.answer ? 'planilha' : '—'
        console.log(
          `  ${String(item.position).padStart(2)} ${item.title.padEnd(34)} ${(item.answer || '(vazio)').padEnd(8)} ${origin}${item.note ? ` · ${item.note}` : ''}`,
        )
      }
      created += 1
      continue
    }

    if (options.dryRun) {
      const answered = applicationItems.filter((i) => i.answer && !i.suggested).length
      console.log(
        `${row.apartment}: + application draft (${answered}/${applicationItems.length} respondidos pela planilha) (dry run)`,
      )
      created += 1
      continue
    }

    await rest.post('/applications', {
      id: generateId('application_'),
      checklistId: checklist.id,
      tagsIds: [tag.id],
      date: options.date,
      status: 'draft',
      transcript: null,
      gallerySourceApplicationId: previous?.id ?? null,
      items: applicationItems,
    })
    created += 1
    const answered = applicationItems.filter((i) => i.answer && !i.suggested).length
    console.log(
      `${row.apartment}: + application draft (${answered}/${applicationItems.length} respondidos pela planilha)`,
    )
  }

  console.log(`\ncriados: ${created} · pulados: ${skipped}`)
  reportGaps(gaps)
}

/**
 * A resposta de um item a partir da célula da sua coluna.
 *
 * `answer: null` quer dizer "a planilha não respondeu isso" — quem chama
 * decide se herda da visita anterior ou deixa em branco.
 */
function resolveAnswer(
  row: Row,
  column: Column,
  item: ChecklistItem,
  gaps: Gap[],
): { answer: string | null; note?: string } {
  const cell = row.cells.get(column.code) ?? ''

  // "Parede Lavanderia: Tipo 3, 6" só existe nos tipos 3 e 6; nos outros a
  // coluna P da planilha (uniformemente "o") não diz nada de útil. Nos tipos
  // 3 e 6 o valor vem da visita anterior, não do CSV.
  if (column.code === 'P') {
    if (row.type !== 3 && row.type !== 6) {
      return {
        answer: '',
        note: `Não se aplica — item vale só para os tipos 3 e 6 (aqui: tipo ${row.type})`,
      }
    }
    return { answer: null }
  }

  if (cell === '') {
    gaps.push({
      scope: `${row.apartment} · ${item.title}`,
      reason: `célula ${column.code} vazia`,
    })
    return { answer: null }
  }

  const mark = ANSWER_BY_MARK[cell]
  if (mark) return { answer: mark }

  // Célula com lista de cômodos: nomeia os que faltam, o resto está feito.
  const tokens = cell.split(',').map((token) => normalize(token))
  const rooms = tokens.map((token) => ROOM_BY_TOKEN[token])
  if (rooms.some((room) => !room)) {
    const unknown = tokens.filter((token) => !ROOM_BY_TOKEN[token])
    gaps.push({
      scope: `${row.apartment} · ${column.legend}`,
      reason: `célula "${cell}" tem abreviação desconhecida (${unknown.join(', ')}) — grupo inteiro não respondido`,
    })
    return { answer: null }
  }

  const suffix = column.prefix ? normalize(item.title.slice(column.prefix.length)) : ''
  if (!suffix) {
    gaps.push({
      scope: `${row.apartment} · ${item.title}`,
      reason: `célula "${cell}" lista cômodos mas o item não tem cômodo no título`,
    })
    return { answer: null }
  }
  return { answer: rooms.includes(suffix) ? 'Não' : 'Sim' }
}

function reportGaps(gaps: Gap[]) {
  if (gaps.length === 0) {
    console.log('\nNada ficou sem validação.')
    return
  }
  // Agrupa pelo motivo: os buracos se repetem em todos os 60 apartamentos, e
  // uma linha por apartamento enterraria os casos realmente isolados.
  const byReason = new Map<string, string[]>()
  for (const gap of gaps) {
    const list = byReason.get(gap.reason) ?? []
    list.push(gap.scope)
    byReason.set(gap.reason, list)
  }
  console.log('\nNÃO validado pela planilha:')
  for (const [reason, scopes] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
    const shown =
      scopes.length > 6
        ? `${scopes.slice(0, 6).join(', ')} … (+${scopes.length - 6})`
        : scopes.join(', ')
    console.log(`  · ${reason}\n      ${shown}`)
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const { command, options, flags } = parseOptions(process.argv.slice(2))
  if (flags.get('help')) {
    console.log(USAGE)
    return
  }
  const target = resolveTarget(flags)
  console.log(
    [
      `REST  : ${target.baseUrl} (org ${target.orgId} / project ${target.projectId})`,
      `Modo  : ${options.dryRun ? 'DRY RUN — nada será escrito' : 'escrita'}`,
    ].join('\n'),
  )
  const rest = new Rest(target)
  await rest.assertReachable()
  if (command === 'complete-drafts') await completeDrafts(rest, options)
  else await create(rest, options)
}

main().catch((error) => {
  console.error(`\nErro: ${(error as Error).message}`)
  process.exit(1)
})
