# Server-side application grouping (proposal)

How the histórico list would look if the backend returned tag-set groups already
built, instead of the client grouping a flat `GET /applications` page.

Status: **implemented** (client side), with three deviations from the proposal
below. The endpoint exists as specified in §2; `openapi.json` and the generated
client carry it.

What the client actually does, where it differs from §5/§6:

- **`q` and `sort` stayed client-side.** They are `useState` over the fetched
  groups, not query params. Sending them would mean a request per keystroke and
  a separate React Query key — therefore a separate offline snapshot — per
  filter/sort combination, to re-order at most a page of groups. The request
  sends the canonical `sort=recent` and the picker re-orders locally through the
  `sortGroupsByTagLabels` §5 kept as a fallback anyway.
- **`applicationsPerGroup=50`, not 3.** The expanded card lists every visit it
  is given, so 3 would hide history the screen shows today. The card's count
  reads the group's `applicationsCount` (new `visitsCount` prop on
  `ApplicationRow`), so a group past 50 visits still shows its real total.
- **§6 resolved as the first shape, with the grouping reused rather than
  duplicated.** The embedded `applications` are flattened and fed to
  `useEntityList` as this screen's server half, so the per-entity overlay is
  untouched; the server's grouping is used as-is while the outbox is empty, and
  any pending application op makes the screen re-group the overlaid flat list
  with the existing `groupApplicationsByTagSet`. No second implementation of the
  key function — `tagsKey` is now exported and used by both paths.

One consequence worth knowing: the payload no longer carries items, so
"repetir" resolves its source application through
`ensureApplicationRest` (cache, else a single-application fetch) before copying
answers. Offline on an application never opened on this device, it degrades to a
new visit with the same tags and no carried-over answers.

---

## 1. What the client does today

`checklist-detail.container.ts` reads a flat list and derives the whole screen:

| Step | Where | What it needs |
| --- | --- | --- |
| Fetch | `useApplicationsListRestResult(checklistId)` | `pageSize=100`, `include=items,attachments` |
| Group | `groupApplicationsByTagSet` | order-insensitive key `[...tagsIds].sort().join('|')` |
| Order inside group | `compareApplicationRecency` | `date` desc, `createdAt` desc as tiebreak |
| Order groups | same comparator on `applications[0]` | — |
| Labels | `resolveLabels(group.tagsIds)` | the whole tag catalog |
| Badge count | `countNegativeAnswers(application, checklist)` | every item's `answer` + the checklist's `options[].semantic` |
| Filter | substring over resolved `tagLabels` | — |
| Re-sort | `sortGroupsByTagLabels(recent \| alpha \| numeric)` | hand-rolled `naturalCompare` (Hermes ignores `Intl` numeric collation) |

The expensive part is the badge — and it is already solved server-side. The
`Application` response schema in `openapi.json` **already returns**
`negativeCount`, `answeredCount`, `totalCount` and `attachmentsCount` as
first-class fields. `fromApplicationResponse` simply doesn't map them, so
`checklist-detail.container.ts` recomputes `negativeCount` from raw items — which
is the only reason the list request carries `include=items,attachments` at all.
A collapsed card shows a tag line, a visit count, a status and three dates, and
to render it we download every item and every attachment row of every
application in the checklist.

**That part is a standalone fix, not part of this proposal:** map the four counts
in `fromApplicationResponse`, drop `include` from `APPLICATIONS_LIST_PARAMS`
(keep it on the single-application read — photo previews need it), and the list
payload collapses without any new endpoint. Worth doing first, independently.

---

## 2. Endpoint

```
GET /orgs/{orgId}/projects/{projectId}/application-groups
      ?checklistId=chk_123         # required — groups are scoped to one checklist
      &groupBy=tagSet              # only mode today; leaves room for groupBy=date|checklistItem
      &sort=recent                 # recent (default) | alpha | numeric
      &q=bloco%202                 # substring match over resolved tag labels
      &applicationsPerGroup=3      # applications embedded per group (default 3, max 50)
      &page=1&pageSize=50          # offset pagination over *groups*, same as every other list
      &status=draft&from=…&to=…    # same filters `/applications` already accepts
      &updatedSince=…
```

Everything but `groupBy` and `applicationsPerGroup` already exists as a query
param on `GET /applications` (`page`, `pageSize`, `sort`, `checklistId`,
`status`, `from`, `to`, `updatedSince`, `include`) — this endpoint reuses those
names and meanings rather than inventing a parallel vocabulary. `include` keeps
working exactly as it does today, and the histórico calls this endpoint with it
**omitted**: the counts it needs are plain `Application` fields, so an empty
`include` is the whole point of the request.

### Why this endpoint exists

Not to move computation off the device. Grouping ~100 applications by tag set is
a couple of `Map` passes and costs nothing measurable. The point is **payload**:
today the screen downloads every item and attachment row in the checklist to
render cards that show a tag line, a date and a count. Grouping is what lets the
server send the last 3 visits per tag set instead of all of them, and
`include=` (empty) is what stops the items from coming along.

So this is a read projection, not a new domain concept — which is why §3 adds as
little schema as it possibly can.

Two things deliberately stay client-side:

- **Date formatting.** `date` stays ISO; `formatBrDateShort` keeps owning
  presentation. A server-rendered `dateLabel` would bake locale into the cache.
- **Expanded-card reversal.** `DetailedCard` renders
  `applications.slice(1).reverse()` above `applications[0]`. That is a layout
  choice, not a data one — see §4.

---

## 3. Zod schema

The only new schema is a three-field wrapper. `applications` holds **core
`Application` objects, verbatim** — no bespoke entry type, no parallel
projection to keep in sync, and `fromApplicationResponse` is reused as-is on the
client.

```ts
import { z } from 'zod'
import { applicationSchema } from '@core/schemas/application' // the existing $id: "Application"

export const applicationGroupSchema = z.object({
  /**
   * The tag set this group is keyed on, in canonical (sorted) order — sorted so
   * that `[a, b]` and `[b, a]` serialize identically and the client's existing
   * `tagsKey` produces the same string the server grouped on. Empty array = the
   * untagged group.
   */
  tagsIds: z.array(z.string()),

  /**
   * Total visits in the group, *independent of* `applicationsPerGroup`. The only
   * field here that isn't derivable from `applications` — truncation hides it,
   * and the card's "12 vistorias" label needs the real number.
   */
  applicationsCount: z.number().int().positive(),

  /**
   * Newest first: `applications[0]` is the latest visit (§4.1). Truncated to
   * `applicationsPerGroup`.
   *
   * Core `Application`, unmodified — including `negativeCount`, `answeredCount`,
   * `totalCount` and `attachmentsCount`, which the schema already carries. With
   * `include` omitted, `items` and `attachments` come back empty and those four
   * counts are what the cards read.
   */
  applications: z.array(applicationSchema),
})

/**
 * The house envelope — `{ data, meta }` with `meta.pagination`, exactly the
 * `ListMeta`/`PaginationMeta` shape every other list response in `openapi.json`
 * returns. Offset-paginated (`page`/`pageSize`/`pageCount`/`total`), not a
 * cursor, so the generated client shares unwrapping with `listApplications`.
 *
 * `total` and `pageCount` count **groups**, not applications.
 */
export const applicationGroupsResponseSchema = z.object({
  data: z.array(applicationGroupSchema),
  meta: listMetaSchema, // reused as-is: { pagination: { page, pageSize, pageCount, total } }
})

export type ApplicationGroup = z.infer<typeof applicationGroupSchema>
```

### What was dropped, and why

| Dropped | Reason |
| --- | --- |
| `applicationGroupEntrySchema` | A subset of `Application` with different field names is a second schema to migrate every time the core one changes. `Application` minus `include` is already the lean shape. |
| `key` | `[...tagsIds].sort().join('|')` — the client already has `tagsKey` and needs to keep it for the offline merge (§6) anyway. One implementation, not two that must agree. |
| `latest` | Redundant with `applications[0]` whenever `applicationsPerGroup >= 1`, which the histórico always sends. |
| `tagLabels` | The client loads the tag catalog regardless (the batch-edit sheet needs it), so `resolveLabels(tagsIds)` stays the single source of labels. The server still needs them internally to honor `sort=alpha\|numeric` and `q` — it just doesn't have to echo them back. |
| `meta.sort` echo | Not worth extending `ListMeta` for. The client sent the param; it knows the value. |

---

## 4. Ordering contract

### 4.1 Inside a group — newest first, always

`applications[0]` is the most recent visit. Order is `date` descending, with
`createdAt` descending as the tiebreak (same-day repeat visits, or a date edited
by hand to match another — without the tiebreak a tie resolves to whatever the
storage engine returned first).

Newest-first is not a display preference, it is what makes truncation correct:
`applicationsPerGroup=3` means *the last 3 visits*. Oldest-first plus a limit
would drop exactly the rows the card is about.

The expanded card shows the latest at the **bottom**, with the older ones above
it in chronological order. That is `applications.slice(1).reverse()` in
`DetailedCard` and it stays there — one canonical wire order, reversed at the
point of render, beats a `direction` query param that only one of two layouts
wants.

```
wire:           [ 28/09 (latest), 21/09, 14/09 ]
                       │            │      │
collapsed card:  "3 vistorias · Rascunho"   (reads latest only)

expanded card:  Vistorias anteriores
                  14/09        ← applications[2]
                  21/09        ← applications[1]
                  28/09  ●     ← applications[0], emphasized, last
                [ Nova aplicação ]
```

### 4.2 Between groups

| `sort` | Order | Notes |
| --- | --- | --- |
| `recent` (default) | by each group's newest visit: `date` desc, `createdAt` desc | matches today's default |
| `alpha` | `tagLabels.join(' ')`, pt-BR, accent- and case-insensitive | `Á` collates with `A` |
| `numeric` | natural order on the same joined label | `Bloco 2` before `Bloco 10` |

Two rules hold in every mode:

1. **The untagged group is pinned last.** It has no label to sort by, so under
   `alpha`/`numeric` an empty string would collate it to the top.
2. **Ties break on the sorted `tagsIds`** so paging is stable — two groups with
   identical labels must not swap places between page 1 and page 2.

`numeric` is the client's current default and is the one worth checking on the
server: it must be a natural-order comparator, not `localeCompare(…, { numeric:
true })`. The client hand-rolled `naturalCompare` precisely because Hermes
silently ignores that option and sorted `101` before `99`; a Postgres
`ORDER BY label COLLATE "…"` has the same trap. Sorting on a precomputed
zero-padded sort key is the usual fix.

### 4.3 Grouping key

Membership is the **exact tag set**, order-insensitive: `[a, b]` and `[b, a]`
are one group, `[a]` and `[a, b]` are two. The wire carries only the sorted
`tagsIds`; the client derives its own string key from it with the `tagsKey` it
already has. The untagged group is `tagsIds: []`, and `tagsKey` must keep
mapping that to a non-empty string — the batch-tag-edit draft is keyed on it
(`batch-tags:${group.key}`), and an empty key silently orphans the draft.

---

## 5. What this changes on the client

| Removed | Kept |
| --- | --- |
| `groupApplicationsByTagSet` | `sortGroupsByTagLabels` — only as a fallback for the offline snapshot |
| `compareApplicationRecency` (list path) | `formatBrDateShort` |
| `countNegativeAnswers` in the list (already redundant — see §1) | `countNegativeAnswers` on the fill screen |
| — | `resolveLabels` in the list: labels are **not** on the wire (§3), so this stays |
| — | `tagsKey`, now the client's only piece of grouping logic — the offline merge needs it |
| local `historySearch` filtering | the search input — it now drives `q` |
| `include=items,attachments` on the list | the same `include` on the single-application read |
| the `checklist` dependency of `allGroups` | — |

`useChecklistDetailContainer` loses most of its `useMemo` chain and becomes a
hook over query params: `sort` and `q` move from `useState` into the request. It
keeps one small `useMemo` — mapping each group's core `Application`s into
`ApplicationRowEntry` (`formatBrDateShort`, `negativeCount` now read straight off
the response) and resolving `tagLabels`.

`fromApplicationResponse` is reused untouched, which is the payoff of not
inventing an entry schema.

---

## 6. The offline problem (read this before scheduling it)

Per ADR 0009 the offline queue is the only write path, and `useEntityList`
overlays pending ops onto the server list **by entity id**. A pre-grouped
response has no entity list to graft onto: a vistoria created offline, or a
batch tag edit that moves four applications from one tag set to another, would
not move between groups until the queue drains and the server re-groups.

Two viable shapes:

- **Groups as a projection, flat list as the source of truth.** Keep
  `GET /applications` for the offline snapshot and the overlay; use
  `/application-groups` as a fast path when the queue is empty. Correct, but the
  grouping code stays in the client and only the common case gets faster.
- **Client re-groups the pending tail only.** The server returns groups; the
  client folds outbox ops into them with a small merge (find group by `tagsKey`,
  splice the pending application in by recency, bump `applicationsCount`). Less
  code than today's full grouping pass, but it is a second implementation of the
  key function — it has to agree with the server's exactly, including
  `__untagged__` and the sort order of `tagsIds`.

The second is the one worth building if the endpoint ships; the first is the
safer intermediate step behind the existing per-entity backend flag (ADR 0012).
