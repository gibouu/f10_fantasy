# Worklog

## Purpose
Shared short-term memory between Claude and Codex.

Use for:
- concise summaries of meaningful changes
- important in-progress findings
- known open issues
- next recommended checks

Do NOT turn this into a giant diary.

## Update Rules
- Keep entries short
- Prefer newest-first
- Remove stale noise
- When a fact becomes durable, move it to `architecture.md` or `decisions.md`

## Entry Format
### YYYY-MM-DD HH:MM — Short title
- by: Claude / Codex / human
- summary:
- files touched:
- verification:
- open questions:
- should update architecture?: yes/no
- should update decisions?: yes/no

---

## Entries

### 2026-06-23 — Gate 2 cleanup queue
- by: Codex
- summary: Gate 2 cleanup is being handled as separate GitHub issues and PRs. Completed and merged so far: #275/#282 RaceSummary mapper centralization, #276/#283 strict maintenance unused-vars cleanup, #280/#284 legacy F1 type removal, #285/#286 README onboarding refresh, #278/#287 mobile exchange race guard replacement, #277/#288 static script test-scope clarification, and #272/#289 DB-backed page dynamic markers for clean builds.
- files touched: multiple focused PRs; this entry is status only.
- verification: Each merged PR had targeted local checks plus GitHub Web checks. Vercel deployment checks are currently failing externally with a build-rate-limit message.
- open questions: #279 remains blocked on confirming local/prod DB rollout before removing broad qualifying fallbacks. #274 remains open as the umbrella until scoped cleanup findings are exhausted or deferred.
- should update architecture?: no
- should update decisions?: no

### 2026-06-23 — Qualifying fallback cleanup caveat
- by: Codex
- summary: The broad `.catch(() => [])` fallbacks around qualifying-result reads are intentional compatibility debt from the qualifying schema rollout. Issue #279 tracks removing or narrowing them.
- files touched: none
- verification: Current code sites are `src/lib/services/race.service.ts` and `src/app/api/races/[id]/route.ts`.
- open questions: Do not remove these fallbacks until the production and local DB schemas are confirmed to include `QualifyingResult`, `Race.openf1QualifyingSessionKey`, and related fields.
- should update architecture?: no
- should update decisions?: no

### 2026-06-23 — Historical diary pruned
- by: Codex
- summary: Replaced the long May implementation diary with this short active ledger. Durable facts from the pruned entries were summarized in `architecture.md` or `decisions.md`: qualifying ingestion, early-bird scoring, mobile JWT revocation precision, calendar reconciliation source rules, chronological race ordering, entrant unions, cancelled-race pick filtering, and existing pick-lock trigger constraints.
- files touched: `ai/docs/worklog.md`, `ai/docs/architecture.md`, `ai/docs/decisions.md`
- verification: `git diff --check`; `npm run test:scripts:static`.
- open questions: Use git history for detailed old PR narratives instead of re-growing this file.
- should update architecture?: no
- should update decisions?: no
