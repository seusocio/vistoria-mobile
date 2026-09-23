# 0011 — Daily inspection report is generated offline from Convex reads

- **Status**: Accepted
- **Date**: 2026-09-23
- **Affects**: `reports/src/main.ts`, `reports/src/data.ts`, `reports/src/html.ts`, `reports/src/pdf.ts`, `reports/output/`

## Context

The daily inspection report ("Relatório de Vistoria Diária") started as a one-off script and is
becoming a recurring deliverable: one document per day with every unit inspected that day, its
checklist answers and its photos. The second real run covered 2026-09-23 — 54 units, 10 floors,
447 photos, 29 answered items. This ADR pins down what the generator does today so future reports
stay "run one command, get HTML + PDF" instead of drifting into per-day custom code.

## Decision

**Keep the report as a standalone Bun project under `reports/` that reads Convex over HTTP,
embeds photo thumbnails as base64, and renders HTML + PDF from the same string.**

Pipeline (`reports/src/`):

1. `data.ts` — `loadEnv` reads `CONVEX_URL` from the app root `.env` / `.env.local` (nothing else).
   `fetchApplications` + `fetchTags` list everything, then `resolveApplications` re-fetches each
   candidate by id (`applications:findById`, concurrency 6) because the list query does not carry
   resolved attachment URLs or full items.
2. `main.ts` — filters, de-duplicates, downloads one 480px JPEG thumbnail per photo (`sharp`,
   quality 78, embedded as `data:` URI so the HTML/PDF files are self-contained), groups units by
   floor, and writes `reports/output/<prefix>-<date>.html` + `.pdf`.
3. `html.ts` — single `renderHtml(model)` template: masthead, metadata table, summary strip, one
   section per floor, one card per unit (checklist table + photo grid).
4. `pdf.ts` — Puppeteer-core prints the *same* HTML string to A4 via the local Chrome
   (`CHROME_PATH`); no separate PDF layout to keep in sync.

## Filters used (and why)

| Filter | Where | Reason |
|---|---|---|
| `application.date` starts with `<YYYY-MM-DD>` | `main.ts` candidates | "Everything done on that day". The field stores an ISO datetime, so prefix match = that calendar day. |
| Unit tag `APT-<n>` must exist | `findUnitLabel` | Excludes non-unit applications (test rows, other checklists). Takes the first tag whose label starts with `APT-`. |
| `--units` allow-list (optional) | `wanted` set, `APT-11,12,20-25` syntax | Partial re-runs (e.g. one floor failed to download). Empty = all units of the day. Both reports so far ran **without** it. |
| One application per unit label (first wins) | `byUnit` map | A unit re-opened twice in a day appears once. First-wins follows list order; there is no "pick the completed one" logic yet. |
| Attachments with `url` and no `deletedAt`, sorted by `position` | per-unit photos | Skips pending-upload and deleted photos. Failed downloads warn and are dropped, not fatal. |
| Items with `answer` and no `deletedAt` | checklist rows + `totalChecked` | Unanswered rows are not printed. A unit with zero answers still gets a card with its photos. |

Presentation-only derivations, not filters: floor = `floor(APT-number / 10)` (`APT-83` → floor 8),
floors sorted descending, units sorted numerically by trailing number, doc number defaults to
`RD-YYYYMMDD`, inspector defaults to `Alyson Vilela`, client to `Lollo Ganassali`.

## How to generate a new report

From the repo root, no build step — defaults already match the two runs so far:

```sh
cd reports
bun run src/main.ts --date 2026-09-23
```

Useful overrides (all optional):

```sh
bun run src/main.ts --date 2026-09-24 --units 11,12,20-25 \
  --out vistoria --inspector "Alyson Vilela" --client "Lollo Ganassali" --doc RD-20260924
```

- `--date` defaults to today (local). `--out` is the filename prefix.
- Output lands in `reports/output/<prefix>-<date>.html` and `.pdf`.
- Needs: network access to `CONVEX_URL`, and Google Chrome at `CHROME_PATH` (`pdf.ts`) for the
  PDF step. The HTML file is written first, so a Chrome failure never loses the data pass.

## Consequences

- Reports are reproducible: same date + same server state = same document. The `.html` is the
  cheap artifact to keep; the `.pdf` is the deliverable.
- Cost scales with photos (~450 thumbnails took a few minutes on 2026-09-23, single-threaded
  downloads + one Chrome render). If a day grows past ~1000 photos, parallelise `downloadThumb`
  or persist thumbnails before touching the template.
- Known gaps, deliberately left open: first-wins dedup ignores a second same-day visit; floor
  math assumes the `APT-<floor><index>` convention; `probe.ts` is a scratch URL-check script, not
  part of the pipeline.

## Reports log

| Date | Command | Result |
|---|---|---|
| 2026-09-16 | `bun run src/main.ts --date 2026-09-16` | 50 units, `vistoria-2026-09-16.html` / `.pdf` |
| 2026-09-23 | `bun run src/main.ts --date 2026-09-23` | 54 units, 10 floors, 447 photos, 29 items, `vistoria-2026-09-23.html` / `.pdf` |
