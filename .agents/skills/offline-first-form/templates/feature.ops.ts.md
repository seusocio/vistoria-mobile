# `<domínio>.ops.ts`

Um arquivo por domínio, em `src/features/<domínio>/shared/`. Cada `defineOp` é registrado no import
do módulo — e o módulo precisa estar em `src/features/ops.ts`.

```ts
import { defineOp } from '@/lib/offline-queue/ops'
import type { Thing } from './thing.types'
import { api } from '../../../../convex/_generated/api'

/**
 * Mirrors `things.create`, que é insert-if-absent: repetir contra uma linha
 * existente é no-op nos dois lados.
 */
export const create = defineOp<{ entity: Thing }, Thing>('things.create', {
  kind: 'thing',
  mutation: api.things.create,
  applyLocal: (entity, args) => entity ?? args.entity,
  entityId: (args) => args.entity.id,
})

export const patchTitle = defineOp<
  { thingId: string; title: string; updatedAt: string },
  Thing
>('things.patchTitle', {
  kind: 'thing',
  mutation: api.things.patchTitle,
  applyLocal: (entity, args) => {
    // O handler do Convex faz exatamente este guard. A entidade pode ainda
    // não existir no servidor (create em voo) — isso é normal.
    if (!entity) return null
    return { ...entity, title: args.title, updatedAt: args.updatedAt }
  },
  entityId: (args) => args.thingId,
})
```

Do lado do Convex, o handler correspondente precisa tolerar replay:

```ts
export const addChild = mutation({
  args: { thingId: v.string(), child: childValidator },
  handler: async (ctx, { thingId, child }) => {
    const thing = await getThing(ctx, thingId)
    if (!thing) return null
    if (thing.children.some((existing) => existing.id === child.id)) return null  // ← idempotência
    await ctx.db.patch('things', thing._id, { children: [...thing.children, child] })
    return null
  },
})
```
