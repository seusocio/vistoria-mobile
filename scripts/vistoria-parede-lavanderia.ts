/**
 * Marca "Parede Lavanderia" como pronta em todos os apartamentos de uma visita.
 *
 *   bun scripts/vistoria-parede-lavanderia.ts [--dry-run]
 *
 * Por padrão mexe só na visita de 28/09 (`--date`), que é a que está em
 * rascunho — as visitas anteriores já foram fechadas e reescrevê-las seria
 * mudar o que foi registrado em campo. Vale para todos os 60 apartamentos,
 * inclusive os que o script de importação tinha deixado em branco por serem de
 * tipo diferente de 3 e 6 (ver `scripts/vistoria-28set.ts`): a resposta agora é
 * "pronto" em todos, então a ressalva de "não se aplica" sai junto.
 */

import { Rest, resolveTarget, parseFlags, TARGET_FLAGS } from './migration-shared'

/** O item é único na checklist; casamos pelo começo do título. */
const ITEM_TITLE_PREFIX = 'Parede Lavanderia'
const ANSWER = 'Sim'

interface Application {
  id: string
  checklistId: string
  tagsIds: string[]
  date: string
  status: 'draft' | 'completed'
  items: Array<{ id: string; title: string; answer: string; note: string; suggested: boolean }>
}

interface Tag {
  id: string
  label: string
}

const USAGE = `
Uso: bun scripts/vistoria-parede-lavanderia.ts [flags]

  --dry-run      Não escreve nada; só mostra o que faria.
  --date=YYYY-MM-DD  Dia da visita a alterar (padrão: 2026-09-28).
  ${TARGET_FLAGS.map((f) => `--${f}`).join(' ')}
`

async function main() {
  const flags = parseFlags(process.argv.slice(2), ['dry-run', 'date', ...TARGET_FLAGS])
  if (flags.get('help')) {
    console.log(USAGE)
    return
  }
  const dryRun = flags.get('dry-run') === 'true'
  const day = flags.get('date') ?? '2026-09-28'
  const target = resolveTarget(flags)
  const rest = new Rest(target)
  await rest.assertReachable()

  console.log(
    [
      `REST  : ${target.baseUrl} (org ${target.orgId} / project ${target.projectId})`,
      `Visita: ${day}`,
      `Modo  : ${dryRun ? 'DRY RUN — nada será escrito' : 'escrita'}`,
    ].join('\n'),
  )

  const tags = await rest.listAll<Tag>('/tags')
  const labelOf = new Map(tags.map((tag) => [tag.id, tag.label]))
  const applications = (await rest.listAll<Application>('/applications')).filter(
    (application) => application.date.slice(0, 10) === day,
  )
  console.log(`\n${applications.length} application(s) em ${day}`)

  let patched = 0
  let already = 0
  for (const [index, summary] of applications.entries()) {
    const apartment = summary.tagsIds.map((id) => labelOf.get(id) ?? id).join(',') || summary.id
    const label = `[${index + 1}/${applications.length}] ${apartment}`
    // `GET /applications` devolve as linhas sem `items`.
    const { data: application } = await rest.get<Application>(`/applications/${summary.id}`)
    const items = application.items.filter((item) => item.title.startsWith(ITEM_TITLE_PREFIX))
    if (items.length === 0) {
      console.log(`${label}: sem item "${ITEM_TITLE_PREFIX}" — pulado`)
      continue
    }
    for (const item of items) {
      if (item.answer === ANSWER && !item.suggested && item.note === '') {
        already += 1
        console.log(`${label}: já estava "${ANSWER}"`)
        continue
      }
      const from = `${item.answer || '(vazio)'}${item.suggested ? ' (sugerido)' : ''}`
      if (dryRun) {
        console.log(`${label}: ${from} -> ${ANSWER} (dry run)`)
        patched += 1
        continue
      }
      await rest.patch(`/application-items/${item.id}`, {
        answer: ANSWER,
        // Resposta confirmada agora, não herdada da visita anterior — e sem a
        // ressalva de "não se aplica" que o import tinha deixado.
        note: '',
        suggested: false,
        suggestionSource: null,
      })
      patched += 1
      console.log(`${label}: ${from} -> ${ANSWER}`)
    }
  }

  console.log(`\nalterados: ${patched} · já estavam: ${already}`)
}

main().catch((error) => {
  console.error(`\nErro: ${(error as Error).message}`)
  process.exit(1)
})
