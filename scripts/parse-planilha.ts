/**
 * Traduz `seed/planilha-vistoria.csv` (a planilha de campo) para o módulo de
 * dados que `convex/seedApplications.ts` consome.
 *
 * Rode com `bun run seed:parse` sempre que a planilha mudar e versione o
 * arquivo gerado - ele é o que fica auditável no diff, não o CSV.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CSV_PATH = join(import.meta.dir, '..', 'seed', 'planilha-vistoria.csv')
const OUT_PATH = join(
  import.meta.dir,
  '..',
  'convex',
  'seedData',
  'planilha20260916.ts',
)

/** Rótulos das opções do checklist `seed-checklist-apartamentos`. */
const YES = 'Sim'
const NO = 'Não'

/**
 * Cada coluna da planilha cobre um conjunto de itens do checklist. As colunas
 * 9 (`P. Porta Entrada`, vazia na planilha inteira) e 10 (`Parede Lavabo`, sem
 * item correspondente no checklist) ficam de fora de propósito.
 */
const COLUMNS: { index: number; name: string; titles: string[] }[] = [
  {
    index: 1,
    name: 'Base Shaft',
    titles: [
      'Base shaft: Cozinha',
      'Base shaft: WC',
      'Base shaft: WCS',
      'Base shaft: Churrasqueira',
    ],
  },
  {
    index: 2,
    name: 'Shaft Gesso',
    titles: [
      'Shaft: Cozinha',
      'Shaft: WC',
      'Shaft: WCS',
      'Shaft: Churrasqueira',
    ],
  },
  {
    index: 3,
    name: 'Forro',
    titles: [
      'Forro gesso: Cozinha',
      'Forro gesso: WC',
      'Forro gesso: WCS',
      'Forro gesso: Churrasqueira',
    ],
  },
  { index: 4, name: 'Lixar', titles: ['Lixa parede'] },
  {
    index: 5,
    name: 'Imperm.',
    titles: [
      'Impermeabilização: Cozinha',
      'Impermeabilização: WC',
      'Impermeabilização: Churrasqueira',
    ],
  },
  {
    index: 6,
    name: 'Lig. Hidraulica',
    titles: [
      'Ligação hidraulica: Cozinha',
      'Ligação hidraulica: WC',
      'Ligação hidraulica: WCS',
      'Ligação hidraulica: Lavanderia',
    ],
  },
  {
    index: 7,
    name: 'Pedras/Porta',
    titles: [
      'Soleira: Porta de entrada',
      'Soleira: WC',
      'Soleira: WCs',
      'Soleira: Churrasqueira',
    ],
  },
  { index: 8, name: 'Chumbar Gás', titles: ['Gas: Chumbar'] },
  {
    index: 11,
    name: 'Parede Lavanderia',
    titles: ['Parede Lavanderia: Tipo 3, 6'],
  },
  {
    index: 12,
    name: 'Contra Marco',
    titles: [
      'Contramarco: Cozinha',
      'Contramarco: Churrasqueira',
      'Contramarco: Q1',
      'Contramarco: Suite',
    ],
  },
]

/**
 * Abreviações que o campo escreve na célula quando só parte dos ambientes
 * ficou pronta (ex.: `Suíte Coz` em Base Shaft = cozinha e WC da suíte
 * prontos, WC social e churrasqueira não).
 */
const AMBIENT_ALIASES: Record<string, string> = {
  coz: 'Cozinha',
  cozinha: 'Cozinha',
  chur: 'Churrasqueira',
  churrasqueira: 'Churrasqueira',
  suite: 'WCS',
  wcs: 'WCS',
  wc: 'WC',
  lavanderia: 'Lavanderia',
}

/** Células que são puro símbolo - qualquer outra coisa vira nota no item. */
const PLAIN_CELLS = new Set(['', 'o', 'x', '-'])

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Sufixo do item depois do `: ` - é ele que casa com as abreviações do campo. */
function titleAmbient(title: string) {
  const separator = title.indexOf(': ')
  return separator === -1 ? '' : normalize(title.slice(separator + 2))
}

interface Answer {
  title: string
  answer: string
  note: string
}

function resolveCell(
  raw: string,
  column: (typeof COLUMNS)[number],
): Answer[] {
  const tokens = normalize(raw).split(' ').filter(Boolean)

  const mentioned = new Set(
    tokens
      .map((token) => AMBIENT_ALIASES[token])
      .filter((ambient): ambient is string => Boolean(ambient))
      .map(normalize),
  )
  const reachable = column.titles.filter((title) =>
    mentioned.has(titleAmbient(title)),
  )

  // Notação de campo: só os ambientes citados ficaram prontos.
  if (reachable.length > 0) {
    return column.titles.map((title) => ({
      title,
      answer: reachable.includes(title) ? YES : NO,
      note: '',
    }))
  }

  const done = tokens.includes('o')
  const notApplicable =
    tokens.includes('na') || (tokens.includes('nao') && tokens.includes('tem'))

  let note = ''
  if (!PLAIN_CELLS.has(normalize(raw))) {
    note =
      !done && notApplicable
        ? `Não se aplica — planilha: "${raw.trim()}"`
        : `Planilha: "${raw.trim()}"`
  }

  return column.titles.map((title) => ({
    title,
    answer: done ? YES : NO,
    note,
  }))
}

function main() {
  const lines = readFileSync(CSV_PATH, 'utf8').split('\n')
  const rows: { apartment: string; answers: Answer[] }[] = []

  for (const line of lines.slice(1)) {
    const fields = line.split(';')
    const apartment = fields[0]?.trim()
    if (!apartment) continue

    const answers = COLUMNS.flatMap((column) =>
      resolveCell(fields[column.index] ?? '', column),
    )
    rows.push({ apartment, answers })
  }

  const titles = new Set(COLUMNS.flatMap((column) => column.titles))
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

  writeFileSync(
    OUT_PATH,
    `/**
 * GERADO por \`bun run seed:parse\` a partir de \`seed/planilha-vistoria.csv\`.
 * Não edite à mão - edite a planilha e rode o parser de novo.
 */

export interface PlanilhaAnswer {
  /** título do item do checklist, casado por título normalizado */
  title: string
  /** rótulo da opção do checklist: 'Sim' ou 'Não' */
  answer: string
  /** anotação do campo preservada quando a célula não era só o/x/- */
  note: string
}

export interface PlanilhaRow {
  /** número do apartamento, casa com a tag \`APT-<numero>\` */
  apartment: string
  answers: PlanilhaAnswer[]
}

export const planilhaRows: PlanilhaRow[] = [
${body}
]
`,
    'utf8',
  )

  const completed = rows.reduce(
    (total, row) =>
      total + row.answers.filter((answer) => answer.answer === YES).length,
    0,
  )
  const noted = rows.reduce(
    (total, row) => total + row.answers.filter((answer) => answer.note).length,
    0,
  )

  console.log(`apartamentos: ${rows.length}`)
  console.log(`itens por apartamento: ${titles.size}`)
  console.log(`respostas 'Sim': ${completed}`)
  console.log(`respostas 'Não': ${rows.length * titles.size - completed}`)
  console.log(`itens com nota da planilha: ${noted}`)
  console.log(`gerado: ${OUT_PATH}`)
}

main()
