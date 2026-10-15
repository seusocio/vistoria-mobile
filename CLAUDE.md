## Agent skills

### Issue tracker

Issues live as GitHub Issues in `seusocio/vistoria-mobile`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Offline writes

Before adding or changing an op (`*.ops.ts`, `src/lib/offline-queue/`, `src/lib/uploads/`), or a cascade/validation rule in `vistoria-api` that touches entities the app writes offline, read `docs/adr/0001-offline-sync-resilience.md` and `docs/adr/0002-offline-sync-cascatas-do-servidor.md`. Every op needs a decided answer to "what if the server answers 4xx for this forever?" — the outbox is FIFO and one stuck op blocks every write behind it.
