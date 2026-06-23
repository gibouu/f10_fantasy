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

### 2026-06-23 13:36 — iOS privacy manifest deduplicated
- by: Codex
- summary: Removed the unused root `ios/PrivacyInfo.xcprivacy`, kept `ios/FXRacing/PrivacyInfo.xcprivacy` as the XcodeGen-sourced manifest, and added User ID / Gameplay Content collected-data declarations for username, friend identifier, favorite-team, and pick API payloads.
- files touched: `ios/FXRacing/PrivacyInfo.xcprivacy`, `ios/privacy-manifest.test.mjs`, `ios/PrivacyInfo.xcprivacy`, `package.json`
- verification: `node --test ios/privacy-manifest.test.mjs`; `npm run test:ios`; `npx tsc --noEmit`; `npm run lint`; `npm run build`; `xcodebuild -project FXRacing.xcodeproj -scheme FXRacing -destination 'generic/platform=iOS Simulator' build`
- open questions: Exact App Store Connect privacy-label category mapping still needs owner review, especially whether favorite-team selection should remain under Gameplay Content or be disclosed separately.
- should update architecture?: no
- should update decisions?: no

### 2026-06-23 — Gate 2 cleanup queue
- by: Codex
- summary: Gate 2 cleanup is being handled as separate GitHub issues and PRs. Completed and merged so far: #275/#282 RaceSummary mapper centralization, #276/#283 strict maintenance unused-vars cleanup, #280/#284 legacy F1 type removal, #285/#286 README onboarding refresh, #278/#287 mobile exchange race guard replacement, #277/#288 static script test-scope clarification, #272/#289 DB-backed page dynamic markers for clean builds, #281/#290 worklog pruning, and #291/#292 database entrypoint bootstrap.
- files touched: multiple focused PRs; this entry is status only.
- verification: Each merged PR had targeted local checks plus GitHub Web checks. Vercel deployment checks are currently failing externally with a build-rate-limit message.
- open questions: #279 is in progress after schema rollout confirmation. #274 remains open as the umbrella until scoped cleanup findings are exhausted or deferred.
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
