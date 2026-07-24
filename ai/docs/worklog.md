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

### 2026-07-24 — Issue triage, study findings, and parallel fixes
- by: Codex
- summary: Filed study findings #375–#379. Opened/pushed fix PRs for #365 (DNF copy), #361 (race API cache), #362 (pick optimistic concurrency), #369 (landing strip + screenshot validator), #375/#377 (OpenF1 stints failure + season activation), #376 (sync-schedule entry guards). Release-polish umbrella #367 remains on draft PR #373 gated by simulator verification #368 and App Store tasks #370–#372.
- files touched: multiple focused branches/PRs; this entry is status only.
- verification: per-PR targeted Node suites; several PRs also ran tsc/lint/build as recorded in PR bodies.
- open questions: #368 still needs Simulator verification; #378/#379 cleanup queued; #361 CDN TTFB thresholds need production measurement after deploy.
- should update architecture?: no — cache/invalidation details can land when #361 merges
- should update decisions?: no

### 2026-07-15 — Browser product UI retired behind the App Store landing
- by: Codex
- summary: Removed the retired browser route groups, component/provider/error-reporting tree, shadcn scaffold config, UI utility, and 12 browser-only direct packages. Preserved the complete API/Auth.js/scoring/cron/database surface, client-error intake/sanitizer, and driver/team asset contracts used by iOS.
- files touched: `src/app/(main)`, `src/app/(auth)`, `src/components`, `src/app/error.tsx`, `src/lib/observability/report-client-error.ts`, `src/lib/utils*`, `components.json`, `package*.json`, `tailwind.config.ts`, shared architecture/decision/worklog docs, implementation plan
- verification: retirement guard red (2 expected failures) then green (3/3); source import audit clean; component/page/utils/auth/route suites 124/124; `npx tsc --noEmit`; direct ESLint with the local config; `npx next build --no-lint`; build manifest 24 API entries and 0 retired page entries; `git diff --check`
- open questions: `next lint` discovers the identical ancestor config in this nested worktree and reports a plugin conflict; direct ESLint passes, and a normal CI checkout will not have the duplicate ancestor config.
- should update architecture?: yes — updated
- should update decisions?: yes — updated

### 2026-07-15 02:41 — Race deck review corrections
- by: Codex
- summary: Replaced Upcoming previous-race context with season form from optional race-detail entrant fields, kept qualifying precedence, expanded the deterministic Performance field to all 22 active 2026 drivers across 11 constructors, and restored full-width pick-row chevron alignment without changing gameplay or scoring.
- files touched: race-detail API and season-stat service, shared/Swift driver models, race context/deck/pick panel, Performance fixtures, targeted source/XCTest/UI coverage, architecture/spec/plan docs
- verification: targeted Node 11/11; `test:ios` 88/88; `test:services` 26/26; `test:routes` 80/80; static scripts 13/13; TypeScript, ESLint, production build, and generic Simulator build-for-testing passed; native XCTest 239/239; targeted context/API XCTest 5/5; targeted season-form/full-field UI and repaired picker/ranking UI tests passed in isolation. Two full `MainShellUITests` attempts each exposed one different deterministic-test timing/viewport assumption, both repaired; the root task owns the final post-install 8-test rerun.
- open questions: Root task to rebuild/install/launch the Performance gameplay app, refresh the existing coordinate-pinned companion without deleting history, and run the final full UI class.
- should update architecture?: yes — updated
- should update decisions?: no

### 2026-07-14 15:20 — iOS race deck and performance redesign
- by: Codex
- summary: Kept the P1/P10/DNF game intact while replacing list/detail navigation with centered Upcoming/Past swipe decks, progressive native sheets, cached-first hydration, owner-scoped pick authority, bounded image/detail prefetch, and iOS 26 glass compatibility. Added deterministic Performance-only fixtures and raw p50/p95 measurement tooling.
- files touched: `ios/FXRacing/`, `ios/FXRacingTests/`, `ios/FXRacingUITests/`, `ios/project.yml`, `scripts/ios-performance`, iOS source-contract tests
- verification: `npm run test:ios` (84/84); native XCTest suite (239/239); `MainShellUITests` (7/7). On the dedicated iPhone 17 Pro Simulator, exact 3-warmup/30-sample gates passed for cached launch (launch-to-shell p50 0.164 s / p95 0.188 s; cached publication p50 0.003 s / p95 0.013 s), offline launch (0.284 s / 0.454 s; cached publication 0.012 s / 0.032 s), driver picking (presentation 0.171 s / 0.220 s against 0.500 s; preparation 0.002 s / 0.004 s against 0.100 s), race selection (0.068 s / 0.106 s against 0.600 s), schedule presentation (0.078 s / 0.126 s against 0.500 s), and local save (0.018 s / 0.038 s against 0.200 s). The local-save harness now runs its diagnostic and signpost phases as separate XCTest methods to avoid per-test watchdog termination while retaining an exact 30-sample set for each phase.
- open questions: User visual review of the installed iPhone 17 Pro Simulator build; iOS 17 runtime compatibility pass; expand the localhost annotation companion beyond its current Upcoming screen so prior screens and notes use stable route/element identifiers.
- should update architecture?: yes — updated
- should update decisions?: yes — updated

### 2026-06-23 14:06 — iOS decode logs redacted
- by: Codex
- summary: Removed raw response body previews from iOS API decode-failure logs while retaining endpoint, status, type, timing, byte-count, auth-marker, and decode-error diagnostics.
- files touched: `ios/FXRacing/Core/Networking/APIClient.swift`, `ios/api-client-decode-logging.test.mjs`, `package.json`
- verification: `node --test ios/api-client-decode-logging.test.mjs`; `npm run test:ios`
- open questions: none
- should update architecture?: no
- should update decisions?: no

### 2026-06-23 13:55 — iOS 401 responses normalized
- by: Codex
- summary: Updated iOS API 401 handling so JSON-bodied unauthorized responses still throw `APIError.unauthorized`, preserving `AuthManager.restoreSession()` stale-token cleanup.
- files touched: `ios/FXRacing/Core/Networking/APIClient.swift`, `ios/api-client-unauthorized.test.mjs`, `package.json`
- verification: `node --test ios/api-client-unauthorized.test.mjs`; `npm run test:ios`
- open questions: none
- should update architecture?: no
- should update decisions?: no

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
