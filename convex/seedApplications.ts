import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { planilhaRows } from './seedData/planilha20260916'
import { inspectionDate, vistoriaRows } from './seedData/vistoria'

type Application = Doc<'applications'>
type ApplicationItem = Application['items'][number]
type Checklist = Doc<'checklists'>

const CHECKLIST_ID = 'seed-checklist-apartamentos'

/** Rótulo da opção de semântica positiva do checklist - tudo fora dela é negado. */
const POSITIVE_ANSWER = 'Sim'

/**
 * O lote que o estagiário criou em campo: aplicações ativas datadas nesses
 * dois dias. As aplicações de 22 e 23/09 são testes e ficam de fora.
 */
const LOTE_DATE_PREFIXES = ['2026-09-16', '2026-09-17']

/**
 * Data das aplicações que faltam no lote (aptos 16, 54 e 101-106). A planilha
 * vale do dia 16 em diante e as próximas vistorias são a evolução desta.
 */
const NEW_APPLICATION_DATE = '2026-09-16T12:00:00.000Z'

/**
 * Títulos casam por forma normalizada: o checklist tem espaço duplo em
 * `Forro gesso:  WC` e caixa inconsistente em `Soleira: WCs`, e a planilha não
 * deve quebrar quando alguém arrumar isso.
 */
function normalizeTitle(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function tagNormalizedLabel(apartment: string) {
  return `apt-${apartment}`
}

/**
 * Reconstrói `items` a partir do checklist atual, aplicando a planilha. Preserva
 * id, anexos, quantidade e tags das linhas que já existiam (casando por
 * `checklistItemId`) para que rodar de novo não jogue trabalho fora, e cria as
 * linhas dos itens que entraram no checklist depois da aplicação - é o caso dos
 * quatro `Contramarco:`, ausentes nas 26 linhas do lote.
 */
function buildItems(
  checklist: Checklist,
  existing: ApplicationItem[],
  answersByTitle: Map<string, { answer: string; note: string }>,
  applicationId: string,
  now: string,
): ApplicationItem[] {
  const previousByChecklistItemId = new Map(
    existing
      .filter((item) => item.checklistItemId)
      .map((item) => [item.checklistItemId as string, item]),
  )

  return checklist.items
    .filter((item) => !item.deletedAt)
    .map((checklistItem, index) => {
      const previous = previousByChecklistItemId.get(checklistItem.id)
      const planilha = answersByTitle.get(normalizeTitle(checklistItem.title))

      return {
        id: previous?.id ?? `aitem-planilha-${applicationId}-${index}`,
        position: checklistItem.position,
        checklistItemId: checklistItem.id,
        parentId: checklistItem.parentId ?? null,
        title: checklistItem.title,
        description: checklistItem.description,
        answer: planilha?.answer ?? '',
        answeredAt: planilha ? now : null,
        note: planilha?.note ?? '',
        quantity: previous?.quantity ?? null,
        attachments: previous?.attachments ?? [],
        tagsIds: previous?.tagsIds ?? [...checklistItem.tagsIds],
        suggested: false,
        suggestionSource: null,
        workflowStatus:
          planilha && planilha.answer !== POSITIVE_ANSWER ? 'denied' : null,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      }
    })
}

async function findChecklist(ctx: MutationCtx): Promise<Checklist> {
  const checklist = await ctx.db
    .query('checklists')
    .withIndex('by_external_id', (q) => q.eq('id', CHECKLIST_ID))
    .first()
  if (!checklist) throw new Error(`checklist ${CHECKLIST_ID} não encontrado`)
  return checklist
}

/**
 * Preenche o lote de vistorias de 16-17/09/2026 com a planilha de campo.
 *
 * `x`, `-` e célula vazia viram `Não` + `workflowStatus: 'denied'` (toda
 * aplicação nasce negada); `o` vira `Sim`. Células com anotação (`NA x`,
 * `Não tem`) mantêm o texto da planilha na nota do item, e células com
 * notação de ambiente (`Suíte Coz` em Base Shaft) marcam só os ambientes
 * citados - a tradução toda acontece em `scripts/parse-planilha.ts`.
 *
 * Idempotente: rodar de novo reescreve as mesmas respostas e não duplica
 * aplicações. Use `dryRun: true` para ver o relatório sem gravar nada.
 */
export const fillFromPlanilha = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const now = new Date().toISOString()
    const checklist = await findChecklist(ctx)

    const checklistTitles = new Set(
      checklist.items
        .filter((item) => !item.deletedAt)
        .map((item) => normalizeTitle(item.title)),
    )
    const unknownTitles = [
      ...new Set(
        planilhaRows
          .flatMap((row) => row.answers.map((answer) => answer.title))
          .filter((title) => !checklistTitles.has(normalizeTitle(title))),
      ),
    ]
    if (unknownTitles.length > 0) {
      throw new Error(
        `planilha aponta para itens que não existem no checklist: ${unknownTitles.join(', ')}`,
      )
    }

    const activeApplications = await ctx.db
      .query('applications')
      .withIndex('by_deleted_at', (q) => q.eq('deletedAt', null))
      .collect()
    const lote = activeApplications.filter(
      (application) =>
        application.checklistId === CHECKLIST_ID &&
        LOTE_DATE_PREFIXES.some((prefix) => application.date.startsWith(prefix)),
    )

    let updated = 0
    let created = 0
    const missingTags: string[] = []

    for (const row of planilhaRows) {
      const tag = await ctx.db
        .query('tags')
        .withIndex('by_normalized_label', (q) =>
          q.eq('normalizedLabel', tagNormalizedLabel(row.apartment)),
        )
        .first()
      if (!tag) {
        missingTags.push(row.apartment)
        continue
      }

      const answersByTitle = new Map(
        row.answers.map((answer) => [
          normalizeTitle(answer.title),
          { answer: answer.answer, note: answer.note },
        ]),
      )

      const targets = lote.filter((application) =>
        application.tagsIds.includes(tag.id),
      )

      if (targets.length === 0) {
        const id = `seed-app-planilha-apt-${row.apartment}`
        const existing = await ctx.db
          .query('applications')
          .withIndex('by_external_id', (q) => q.eq('id', id))
          .first()

        const items = buildItems(
          checklist,
          existing?.items ?? [],
          answersByTitle,
          id,
          now,
        )

        if (!dryRun) {
          if (existing) {
            await ctx.db.patch('applications', existing._id, {
              items,
              updatedAt: now,
            })
          } else {
            await ctx.db.insert('applications', {
              id,
              checklistId: CHECKLIST_ID,
              tagsIds: [tag.id],
              date: NEW_APPLICATION_DATE,
              status: 'completed',
              items,
              attachments: [],
              gallerySourceApplicationId: null,
              transcript: null,
              createdAt: now,
              updatedAt: now,
              completedAt: now,
              deletedAt: null,
            })
          }
        }

        if (existing) updated += 1
        else created += 1
        continue
      }

      for (const application of targets) {
        const items = buildItems(
          checklist,
          application.items,
          answersByTitle,
          application.id,
          now,
        )
        if (!dryRun) {
          await ctx.db.patch('applications', application._id, {
            items,
            updatedAt: now,
          })
        }
        updated += 1
      }
    }

    return {
      dryRun: Boolean(dryRun),
      apartments: planilhaRows.length,
      applicationsUpdated: updated,
      applicationsCreated: created,
      itemsPerApplication: checklist.items.filter((item) => !item.deletedAt)
        .length,
      missingTags,
    }
  },
})

/**
 * Carrega uma vistoria nova a partir da planilha de campo em xlsx, gerada e
 * reimportada por `scripts/vistoria-xlsx.ts`.
 *
 * Diferente de `fillFromPlanilha`, que preencheu as aplicações que já existiam
 * do lote de 16-17/09, esta cria **um lote novo** datado em `inspectionDate` -
 * cada vistoria é uma aplicação a mais na linha do tempo do apartamento, não
 * uma sobrescrita da anterior.
 *
 * Idempotente pelo id determinístico `seed-app-vistoria-<data>-apt-<n>`:
 * reimportar a mesma planilha corrige o lote em vez de duplicá-lo.
 */
export const fillFromVistoria = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const now = new Date().toISOString()
    const checklist = await findChecklist(ctx)

    const checklistTitles = new Set(
      checklist.items
        .filter((item) => !item.deletedAt)
        .map((item) => normalizeTitle(item.title)),
    )
    const unknownTitles = [
      ...new Set(
        vistoriaRows
          .flatMap((row) => row.answers.map((answer) => answer.title))
          .filter((title) => !checklistTitles.has(normalizeTitle(title))),
      ),
    ]
    if (unknownTitles.length > 0) {
      throw new Error(
        `planilha aponta para itens que não existem no checklist: ${unknownTitles.join(', ')}`,
      )
    }

    const date = `${inspectionDate}T12:00:00.000Z`
    let updated = 0
    let created = 0
    const missingTags: string[] = []

    for (const row of vistoriaRows) {
      const tag = await ctx.db
        .query('tags')
        .withIndex('by_normalized_label', (q) =>
          q.eq('normalizedLabel', tagNormalizedLabel(row.apartment)),
        )
        .first()
      if (!tag) {
        missingTags.push(row.apartment)
        continue
      }

      const answersByTitle = new Map(
        row.answers.map((answer) => [
          normalizeTitle(answer.title),
          { answer: answer.answer, note: answer.note },
        ]),
      )

      const id = `seed-app-vistoria-${inspectionDate}-apt-${row.apartment}`
      const existing = await ctx.db
        .query('applications')
        .withIndex('by_external_id', (q) => q.eq('id', id))
        .first()

      const items = buildItems(
        checklist,
        existing?.items ?? [],
        answersByTitle,
        id,
        now,
      )

      if (!dryRun) {
        if (existing) {
          await ctx.db.patch('applications', existing._id, {
            items,
            updatedAt: now,
          })
        } else {
          await ctx.db.insert('applications', {
            id,
            checklistId: CHECKLIST_ID,
            tagsIds: [tag.id],
            date,
            status: 'completed',
            items,
            attachments: [],
            gallerySourceApplicationId: null,
            transcript: null,
            createdAt: now,
            updatedAt: now,
            completedAt: now,
            deletedAt: null,
          })
        }
      }

      if (existing) updated += 1
      else created += 1
    }

    return {
      dryRun: Boolean(dryRun),
      inspectionDate,
      apartments: vistoriaRows.length,
      applicationsCreated: created,
      applicationsUpdated: updated,
      itemsPerApplication: checklist.items.filter((item) => !item.deletedAt)
        .length,
      missingTags,
    }
  },
})
