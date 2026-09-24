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
 * O lote-baseline: as vistorias que o estagiário levantou na planilha, datadas
 * nesses dois dias. É delas que sai o conteúdo que `cloneBaselineForward`
 * propaga para as vistorias seguintes do mesmo apartamento.
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

/**
 * Propaga o lote de 16-17/09 para as vistorias seguintes do mesmo apartamento.
 *
 * Cada apto tem um baseline (o lote da planilha: respostas completas, sem
 * fotos) e uma ou mais vistorias posteriores que o campo abriu só para tirar
 * foto - elas ficaram com as 7-11 fotos e nenhuma resposta. Aqui o conteúdo do
 * baseline desce para elas: respostas, notas e `workflowStatus`, mantendo a
 * galeria de fotos de cada uma intacta (as fotos são o que não se clona) e
 * deixando-as como `draft`, porque a vistoria nova é a que está em andamento.
 *
 * O baseline em si é normalizado para `completed`.
 *
 * Idempotente: rodar de novo reescreve o mesmo conteúdo. `dryRun: true`
 * devolve o relatório sem gravar.
 */
export const cloneBaselineForward = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const now = new Date().toISOString()
    const checklist = await findChecklist(ctx)

    const tags = await ctx.db.query('tags').collect()
    const apartmentByTagId = new Map<string, string>()
    for (const tag of tags) {
      const match = tag.label.match(/^APT-(\d+)$/)
      if (match) apartmentByTagId.set(tag.id, match[1])
    }

    const applications = (
      await ctx.db
        .query('applications')
        .withIndex('by_deleted_at', (q) => q.eq('deletedAt', null))
        .collect()
    ).filter((application) => application.checklistId === CHECKLIST_ID)

    const byApartment = new Map<string, Application[]>()
    for (const application of applications) {
      const apartment = application.tagsIds
        .map((id) => apartmentByTagId.get(id))
        .find(Boolean)
      if (!apartment) continue
      const list = byApartment.get(apartment) ?? []
      list.push(application)
      byApartment.set(apartment, list)
    }

    const isBaseline = (application: Application) =>
      LOTE_DATE_PREFIXES.some((prefix) => application.date.startsWith(prefix))

    let baselinesCompleted = 0
    let cloned = 0
    let itemsGrown = 0
    const withoutBaseline: string[] = []

    for (const [apartment, list] of [...byApartment].sort(
      (a, b) => Number(a[0]) - Number(b[0]),
    )) {
      // Entre baselines (o apto 73 tem duas), vale a que tem mais respostas.
      const baseline = list
        .filter(isBaseline)
        .sort(
          (a, b) =>
            b.items.filter((item) => item.answer).length -
            a.items.filter((item) => item.answer).length,
        )[0]

      if (!baseline || baseline.items.every((item) => !item.answer)) {
        withoutBaseline.push(apartment)
        continue
      }

      if (baseline.status !== 'completed') {
        if (!dryRun) {
          await ctx.db.patch('applications', baseline._id, {
            status: 'completed',
            completedAt: baseline.completedAt ?? now,
            updatedAt: now,
          })
        }
        baselinesCompleted += 1
      }

      const answersByTitle = new Map(
        baseline.items
          .filter((item) => !item.deletedAt)
          .map((item) => [
            normalizeTitle(item.title),
            { answer: item.answer, note: item.note },
          ]),
      )

      for (const target of list) {
        if (target._id === baseline._id) continue
        if (isBaseline(target)) continue

        const items = buildItems(
          checklist,
          target.items,
          answersByTitle,
          target.id,
          now,
        )
        if (items.length !== target.items.length) itemsGrown += 1

        if (!dryRun) {
          // `attachments` fica de fora do patch: a galeria de fotos é dela.
          await ctx.db.patch('applications', target._id, {
            items,
            status: 'draft',
            completedAt: null,
            updatedAt: now,
          })
        }
        cloned += 1
      }
    }

    return {
      dryRun: Boolean(dryRun),
      apartments: byApartment.size,
      baselinesCompleted,
      applicationsCloned: cloned,
      itemCountChanged: itemsGrown,
      withoutBaseline,
    }
  },
})
