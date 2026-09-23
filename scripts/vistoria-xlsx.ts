/**
 * Planilha de vistoria em xlsx: exporta o estado atual do Convex para o campo
 * preencher à mão e reimporta a planilha preenchida como dado de seed.
 *
 *   bun run vistoria:export -- --date 2026-10-01
 *   bun run vistoria:import -- seed/vistoria-2026-10-01.xlsx
 *
 * O grid (quais colunas existem e em que ordem) é definido uma vez em
 * `buildGrid` e gravado na aba `meta` da própria planilha, então o importador
 * lê de volta exatamente o que o exportador escreveu - renomear um item do
 * checklist no meio do caminho não desalinha nada.
 */
import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'

const ROOT = join(import.meta.dir, '..')
const CHECKLIST_ID = 'seed-checklist-apartamentos'
const OUT_MODULE = join(ROOT, 'convex', 'seedData', 'vistoria.ts')

/** Rótulos das opções do checklist. */
const YES = 'Sim'
const NO = 'Não'

/** Valores aceitos na célula - o dropdown da planilha oferece exatamente estes. */
const CELL_VALUES = ['o', 'x', '-', 'NA'] as const

const SHEET_GRID = 'Vistoria'
const SHEET_NOTES = 'Observações'
const SHEET_META = 'meta'

/** Primeira linha e primeira coluna de dados no grid (1-indexed, como o Excel). */
const FIRST_DATA_ROW = 3
const FIRST_DATA_COL = 2

interface ChecklistItem {
  id: string
  position: number
  title: string
  deletedAt: string | null
}

interface Checklist {
  id: string
  title: string
  items: ChecklistItem[]
}

interface ApplicationItem {
  title: string
  answer: string
  note: string
  deletedAt: string | null
}

interface Application {
  id: string
  checklistId: string
  tagsIds: string[]
  date: string
  items: ApplicationItem[]
}

interface Tag {
  id: string
  label: string
}

/** Uma coluna do grid: o item do checklist que ela representa. */
interface GridColumn {
  title: string
  group: string
  ambient: string
}

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const file of ['.env', '.env.local']) {
    try {
      for (const line of readFileSync(join(ROOT, file), 'utf8').split('\n')) {
        const match = line.match(/^([A-Z_]+)=(.*)$/)
        if (match) env[match[1]] = match[2].trim().replace(/^"(.*)"$/, '$1')
      }
    } catch {
      // .env.local é opcional; a ausência de CONVEX_URL estoura na primeira query
    }
  }
  return env
}

function client() {
  const url = loadEnv().CONVEX_URL
  if (!url) throw new Error('CONVEX_URL não encontrado em .env / .env.local')
  return new ConvexHttpClient(url)
}

/**
 * Quebra `Base shaft: Cozinha` em grupo + ambiente. Itens sem `: ` (o
 * `Lixa parede` da vida) viram um grupo de coluna única.
 *
 * Os grupos saem na ordem do checklist, mas os ambientes dentro de cada grupo
 * saem na mesma ordem em todos eles - no checklist, Base shaft está em
 * Coz/WCS/Chur/WC e Forro gesso em Coz/Chur/WC/WCS, e alternar a ordem de
 * coluna a cada quatro colunas é convite a marcar a célula errada em campo.
 * A ordem canônica é a da primeira aparição de cada ambiente no checklist.
 */
function buildGrid(checklist: Checklist): GridColumn[] {
  const columns = checklist.items
    .filter((item) => !item.deletedAt)
    .sort((a, b) => a.position - b.position)
    .map((item) => {
      const separator = item.title.indexOf(': ')
      return separator === -1
        ? { title: item.title, group: item.title, ambient: '—' }
        : {
            title: item.title,
            group: item.title.slice(0, separator).trim(),
            ambient: item.title.slice(separator + 2).trim(),
          }
    })

  const ambientOrder = new Map<string, number>()
  for (const column of columns) {
    const key = normalizeTitle(column.ambient)
    if (!ambientOrder.has(key)) ambientOrder.set(key, ambientOrder.size)
  }

  const groupOrder = new Map<string, number>()
  for (const column of columns) {
    if (!groupOrder.has(column.group)) groupOrder.set(column.group, groupOrder.size)
  }

  return [...columns].sort((a, b) => {
    const byGroup =
      (groupOrder.get(a.group) ?? 0) - (groupOrder.get(b.group) ?? 0)
    if (byGroup !== 0) return byGroup
    return (
      (ambientOrder.get(normalizeTitle(a.ambient)) ?? 0) -
      (ambientOrder.get(normalizeTitle(b.ambient)) ?? 0)
    )
  })
}

function normalizeTitle(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function apartmentOf(tagLabel: string) {
  const match = tagLabel.match(/^APT-(\d+)$/)
  return match ? match[1] : null
}

function answeredCount(application: Application) {
  return application.items.filter((item) => !item.deletedAt && item.answer)
    .length
}

/**
 * Uma aplicação só serve de base para a vistoria seguinte se for uma vistoria
 * de verdade: do mesmo checklist, cobrindo todos os itens do grid e com
 * alguma resposta. O deployment acumula aplicações recém-criadas e ainda
 * vazias (são elas as mais recentes) e rascunhos de dois itens - herdar
 * qualquer um dos dois devolveria uma planilha inteira de `x`.
 */
function isUsableSource(application: Application, gridTitles: Set<string>) {
  if (application.checklistId !== CHECKLIST_ID) return false
  if (answeredCount(application) === 0) return false

  const present = new Set(
    application.items
      .filter((item) => !item.deletedAt)
      .map((item) => normalizeTitle(item.title)),
  )
  return [...gridTitles].every((title) => present.has(title))
}

/**
 * Estado corrente de cada apartamento, que é como a planilha nova sai
 * pré-preenchida - a vistoria seguinte é a evolução da anterior, o campo só
 * vira o que avançou. Entre as vistorias aproveitáveis, vale a mais recente;
 * `fromDate` fixa o lote de origem quando você não quer depender disso.
 */
function sourceByApartment(
  applications: Application[],
  tags: Tag[],
  gridTitles: Set<string>,
  fromDate?: string,
) {
  const apartmentByTagId = new Map(
    tags
      .map((tag) => [tag.id, apartmentOf(tag.label)] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  )

  const best = new Map<string, Application>()
  for (const application of applications) {
    if (fromDate && !application.date.startsWith(fromDate)) continue
    if (!isUsableSource(application, gridTitles)) continue

    const apartment = application.tagsIds
      .map((id) => apartmentByTagId.get(id))
      .find(Boolean)
    if (!apartment) continue

    const current = best.get(apartment)
    if (!current || application.date > current.date) {
      best.set(apartment, application)
    }
  }
  return best
}

function sortApartments(apartments: string[]) {
  return [...apartments].sort((a, b) => Number(a) - Number(b))
}

async function exportWorkbook(
  date: string,
  outPath: string,
  fromDate?: string,
) {
  const convex = client()
  const [checklists, tags, applications] = await Promise.all([
    convex.query(makeFunctionReference<'query'>('checklists:list'), {}) as Promise<
      Checklist[]
    >,
    convex.query(makeFunctionReference<'query'>('tags:listAll'), {}) as Promise<
      Tag[]
    >,
    convex.query(
      makeFunctionReference<'query'>('applications:listAll'),
      {},
    ) as Promise<Application[]>,
  ])

  const checklist = checklists.find((item) => item.id === CHECKLIST_ID)
  if (!checklist) throw new Error(`checklist ${CHECKLIST_ID} não encontrado`)

  const grid = buildGrid(checklist)
  const gridTitles = new Set(grid.map((column) => normalizeTitle(column.title)))
  const latest = sourceByApartment(applications, tags, gridTitles, fromDate)
  const apartments = sortApartments(
    tags
      .map((tag) => apartmentOf(tag.label))
      .filter((apartment): apartment is string => Boolean(apartment)),
  )

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'app-vistoria'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(SHEET_GRID, {
    views: [
      {
        state: 'frozen',
        xSplit: FIRST_DATA_COL - 1,
        ySplit: FIRST_DATA_ROW - 1,
      },
    ],
  })

  sheet.getCell(1, 1).value = `Vistoria ${date}`
  sheet.getCell(2, 1).value = 'Apto'
  sheet.getColumn(1).width = 8

  // Linha 1: nome do grupo, mesclado sobre as colunas dele. Linha 2: ambiente.
  let column = FIRST_DATA_COL
  while (column < FIRST_DATA_COL + grid.length) {
    const group = grid[column - FIRST_DATA_COL].group
    let end = column
    while (
      end + 1 < FIRST_DATA_COL + grid.length &&
      grid[end + 1 - FIRST_DATA_COL].group === group
    ) {
      end += 1
    }
    if (end > column) sheet.mergeCells(1, column, 1, end)
    sheet.getCell(1, column).value = group
    column = end + 1
  }

  grid.forEach((gridColumn, index) => {
    const col = FIRST_DATA_COL + index
    sheet.getCell(2, col).value = gridColumn.ambient
    sheet.getColumn(col).width = Math.max(6, gridColumn.ambient.length + 2)
  })

  for (const row of [1, 2]) {
    sheet.getRow(row).font = { bold: true }
    sheet.getRow(row).alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    }
  }

  const notes: { apartment: string; title: string; note: string }[] = []

  apartments.forEach((apartment, index) => {
    const row = FIRST_DATA_ROW + index
    sheet.getCell(row, 1).value = Number(apartment)

    const application = latest.get(apartment)
    const answersByTitle = new Map(
      (application?.items ?? [])
        .filter((item) => !item.deletedAt)
        .map((item) => [normalizeTitle(item.title), item]),
    )

    grid.forEach((gridColumn, columnIndex) => {
      const item = answersByTitle.get(normalizeTitle(gridColumn.title))
      const cell = sheet.getCell(row, FIRST_DATA_COL + columnIndex)
      cell.value = item?.answer === YES ? 'o' : 'x'
      cell.alignment = { horizontal: 'center' }
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${CELL_VALUES.join(',')}"`],
        showErrorMessage: true,
        errorTitle: 'Valor inválido',
        error: `Use ${CELL_VALUES.join(', ')}`,
      }
      if (item?.note) {
        notes.push({ apartment, title: gridColumn.title, note: item.note })
      }
    })
  })

  const lastRow = FIRST_DATA_ROW + apartments.length - 1
  const lastColumn = FIRST_DATA_COL + grid.length - 1
  const range = `${cellRef(FIRST_DATA_ROW, FIRST_DATA_COL)}:${cellRef(lastRow, lastColumn)}`

  sheet.addConditionalFormatting({
    ref: range,
    rules: [
      {
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"o"'],
        priority: 1,
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: 'FFD9F2D9' },
          },
          font: { color: { argb: 'FF1B5E20' } },
        },
      },
      {
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"x"'],
        priority: 2,
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: 'FFFAD9D9' },
          },
          font: { color: { argb: 'FFB71C1C' } },
        },
      },
    ],
  })

  const notesSheet = workbook.addWorksheet(SHEET_NOTES)
  notesSheet.columns = [
    { header: 'Apto', key: 'apartment', width: 8 },
    { header: 'Item', key: 'title', width: 36 },
    { header: 'Observação', key: 'note', width: 60 },
  ]
  notesSheet.getRow(1).font = { bold: true }
  for (const note of notes) notesSheet.addRow(note)

  // O importador lê daqui: sem esta aba ele teria que readivinhar o grid.
  const meta = workbook.addWorksheet(SHEET_META)
  meta.state = 'hidden'
  meta.addRow(['date', date])
  meta.addRow(['checklistId', CHECKLIST_ID])
  meta.addRow(['firstDataRow', FIRST_DATA_ROW])
  meta.addRow(['firstDataCol', FIRST_DATA_COL])
  for (const gridColumn of grid) meta.addRow(['title', gridColumn.title])

  await workbook.xlsx.writeFile(outPath)

  const sourceDates = [
    ...new Set(
      [...latest.values()].map((application) => application.date.slice(0, 10)),
    ),
  ].sort()
  const empty = apartments.filter((apartment) => {
    const application = latest.get(apartment)
    return !application || answeredCount(application) === 0
  })

  console.log(`apartamentos: ${apartments.length}`)
  console.log(`itens por apartamento: ${grid.length}`)
  console.log(`estado herdado de: ${sourceDates.join(', ') || 'nenhuma vistoria'}`)
  console.log(`observações herdadas: ${notes.length}`)
  console.log(
    `sem vistoria anterior preenchida: ${empty.join(', ') || 'nenhum'}`,
  )
  console.log(`gerado: ${outPath}`)
}

/** `A1` a partir de linha/coluna 1-indexadas - o exceljs só aceita ref textual. */
function cellRef(row: number, column: number) {
  let letters = ''
  let remaining = column
  while (remaining > 0) {
    const rest = (remaining - 1) % 26
    letters = String.fromCharCode(65 + rest) + letters
    remaining = Math.floor((remaining - 1) / 26)
  }
  return `${letters}${row}`
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && 'result' in value) {
    return String((value as { result: unknown }).result ?? '')
  }
  if (typeof value === 'object' && 'richText' in value) {
    return (value as ExcelJS.CellRichTextValue).richText
      .map((part) => part.text)
      .join('')
  }
  return String(value)
}

/** Mesmas regras do parser do CSV, para os dois caminhos produzirem o mesmo dado. */
function resolveCell(raw: string) {
  const value = normalizeTitle(raw)
  if (value === 'o') return { answer: YES, note: '' }
  if (value === 'na') return { answer: NO, note: 'Não se aplica' }
  return { answer: NO, note: '' }
}

async function importWorkbook(path: string) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)

  const meta = workbook.getWorksheet(SHEET_META)
  if (!meta) {
    throw new Error(
      `aba "${SHEET_META}" não encontrada - a planilha precisa ser a gerada por vistoria:export`,
    )
  }

  let date = ''
  let firstDataRow = FIRST_DATA_ROW
  let firstDataCol = FIRST_DATA_COL
  const titles: string[] = []
  meta.eachRow((row) => {
    const key = cellText(row.getCell(1).value)
    const value = cellText(row.getCell(2).value)
    if (key === 'date') date = value
    else if (key === 'firstDataRow') firstDataRow = Number(value)
    else if (key === 'firstDataCol') firstDataCol = Number(value)
    else if (key === 'title') titles.push(value)
  })
  if (!date) throw new Error(`aba "${SHEET_META}" sem a data da vistoria`)

  const sheet = workbook.getWorksheet(SHEET_GRID)
  if (!sheet) throw new Error(`aba "${SHEET_GRID}" não encontrada`)

  const notesByKey = new Map<string, string>()
  const notesSheet = workbook.getWorksheet(SHEET_NOTES)
  notesSheet?.eachRow((row, index) => {
    if (index === 1) return
    const apartment = cellText(row.getCell(1).value).trim()
    const title = cellText(row.getCell(2).value).trim()
    const note = cellText(row.getCell(3).value).trim()
    if (apartment && title && note) {
      notesByKey.set(`${apartment} ${normalizeTitle(title)}`, note)
    }
  })

  const rows: {
    apartment: string
    answers: { title: string; answer: string; note: string }[]
  }[] = []
  const invalid: string[] = []

  for (let row = firstDataRow; row <= sheet.rowCount; row++) {
    const apartment = cellText(sheet.getCell(row, 1).value).trim()
    if (!apartment) continue

    const answers = titles.map((title, index) => {
      const raw = cellText(sheet.getCell(row, firstDataCol + index).value).trim()
      if (raw && !CELL_VALUES.includes(raw as (typeof CELL_VALUES)[number])) {
        invalid.push(`apto ${apartment}, ${title}: "${raw}"`)
      }
      const resolved = resolveCell(raw)
      const manualNote = notesByKey.get(
        `${apartment} ${normalizeTitle(title)}`,
      )
      return { title, answer: resolved.answer, note: manualNote ?? resolved.note }
    })

    rows.push({ apartment, answers })
  }

  if (invalid.length > 0) {
    throw new Error(
      `células fora do dropdown (${CELL_VALUES.join(', ')}):\n  ${invalid.join('\n  ')}`,
    )
  }

  const body = rows
    .map(
      (row) =>
        `  {\n    apartment: '${row.apartment}',\n    answers: [\n${row.answers
          .map(
            (answer) =>
              `      { title: ${JSON.stringify(answer.title)}, answer: '${answer.answer}', note: ${JSON.stringify(answer.note)} },`,
          )
          .join('\n')}\n    ],\n  },`,
    )
    .join('\n')

  await Bun.write(
    OUT_MODULE,
    `/**
 * GERADO por \`bun run vistoria:import\` a partir de uma planilha de campo.
 * Não edite à mão - edite o xlsx e reimporte.
 */

export interface VistoriaAnswer {
  /** título do item do checklist, casado por título normalizado */
  title: string
  /** rótulo da opção do checklist: 'Sim' ou 'Não' */
  answer: string
  /** observação do campo, vinda da aba Observações da planilha */
  note: string
}

export interface VistoriaRow {
  /** número do apartamento, casa com a tag \`APT-<numero>\` */
  apartment: string
  answers: VistoriaAnswer[]
}

/** Data da vistoria - vira o \`date\` das aplicações criadas por este lote. */
export const inspectionDate = '${date}'

export const vistoriaRows: VistoriaRow[] = [
${body}
]
`,
  )

  const completed = rows.reduce(
    (total, row) =>
      total + row.answers.filter((answer) => answer.answer === YES).length,
    0,
  )
  console.log(`data da vistoria: ${date}`)
  console.log(`apartamentos: ${rows.length}`)
  console.log(`itens por apartamento: ${titles.length}`)
  console.log(`respostas 'Sim': ${completed}`)
  console.log(`respostas 'Não': ${rows.length * titles.length - completed}`)
  console.log(`observações: ${notesByKey.size}`)
  console.log(`gerado: ${OUT_MODULE}`)
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2)

  if (mode === 'export') {
    const dateFlag = rest.indexOf('--date')
    const date = dateFlag === -1 ? todayISO() : rest[dateFlag + 1]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`--date precisa ser YYYY-MM-DD, recebi "${date}"`)
    }
    const outFlag = rest.indexOf('--out')
    const out =
      outFlag === -1
        ? join(ROOT, 'seed', `vistoria-${date}.xlsx`)
        : rest[outFlag + 1]
    const fromFlag = rest.indexOf('--from')
    const from = fromFlag === -1 ? undefined : rest[fromFlag + 1]
    await exportWorkbook(date, out, from)
    return
  }

  if (mode === 'import') {
    const path = rest.find((arg) => !arg.startsWith('--'))
    if (!path) throw new Error('informe o caminho do xlsx preenchido')
    await importWorkbook(path)
    return
  }

  throw new Error(
    'uso: vistoria-xlsx.ts export [--date YYYY-MM-DD] [--from YYYY-MM-DD] [--out arquivo.xlsx]\n     vistoria-xlsx.ts import <arquivo.xlsx>',
  )
}

main()
