# 0012 — The Convex→REST cut ships one entity at a time, behind a local flag

- **Status**: Accepted
- **Date**: 2026-09-26
- **Affects**: `src/lib/backend-flags.ts` (new), every `*.ops.ts` `send` body, every container's read hook, `src/lib/offline-queue/queue.store.ts`

## Context

`plan/clever-spinning-milner.md` planned the Convex→REST migration as a straight cut: generate the
client, wire all 13 ops to their 23 REST endpoints, ship once. That plan explicitly rejected a
feature flag (`FEATURE_FLAG.backend`) as unnecessary ceremony for a one-time switch.

Grilling the plan surfaced a harder constraint: this is going out as an AI-agent-driven
implementation, with no human re-reading every line before it ships. A straight cut means the first
signal that something is wrong is a field device breaking on the real backend, for every entity at
once, with the offline queue's own FIFO-blocking rule turning one bad endpoint into a jammed queue
for everything behind it.

## Decision

**Each domain entity (`checklists`, `tags`, `applications`, `attachments`) gets its own boolean in a
local `src/lib/backend-flags.ts`, flipped one at a time in that order**, checked at the entity's op
`send` bodies and read-hook call sites. The queue plumbing itself (seams A/B/C/E — outbox, drain,
overlay, connectivity) stays entity-agnostic and is never gated; only "which backend does this
entity's read/write hit" changes per flag.

The rollout pauses once, after `checklists`: static suite green (`bun test
src/lib/offline-queue`) plus a live smoke call (create/read/update/delete a throwaway checklist
against the deployed API) gates a manual check-in. If that holds, the same pattern applies to the
rest with only the smoke check as a gate — not a second human pause — on the reasoning that a
working migration of one entity is evidence the pattern generalizes, not that each entity needs
independent proof.

Because ops are drained from a persisted queue that can outlive an app update, each queued op
captures which backend it targets **at enqueue time**, not at drain time — a flag flip mid-flight
cannot change an already-queued op's destination shape. This mirrors the plan's own fix for the
upload seam (`args.storageKey ?? args.storageId`), generalized from "one field renamed" to "which
backend entirely."

## Considered and rejected

**Straight cut, as originally planned.** Rejected once the implementer is an agent rather than a
human doing a final read-through: a straight cut has no smaller unit of "did this work" than the
whole migration, and the queue's blocking-head behavior means one bad endpoint stops every entity's
writes, not just the broken one.

**A pause after every entity.** Rejected as incompatible with the 2-task budget — five human
check-ins is closer to five tasks than two. The `checklists` pause is meant to validate the
*pattern*, not each entity's specific wiring.

## Not decided here

The actual production cutover (Step 7 of the plan: data migration, `git rm convex/`, removing this
flag machinery entirely) is out of scope. This flag scaffold is deliberately temporary — it gets
deleted once every entity has flipped and Step 7 runs, and that event gets its own ADR (next
available number at that time; note `convex/migrations.ts`'s `resyncApplicationItemsFromChecklist`
and `backfillChecklistItemIds` need retiring or porting then too, since they query Convex's
`checklists` table directly and silently no-op once checklists stop being written there).
