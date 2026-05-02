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

### 2026-05-02 21:00 — Race-finish UX: cron cadence, auto-refresh, animation, COMPLETED-flip fix
- by: Claude
- summary: Four landing-zone improvements aimed at the "race goes from upcoming → results" lifecycle. (1) **AWS cron cadence**: `fx-ingest-results` schedule updated from `rate(30 minutes)` to `rate(5 minutes)` via `aws scheduler update-schedule`. State still ENABLED; same target/role/retry policy. Cuts worst-case race-finish-to-results latency from ~35 min to ~5 min. (2) **Web auto-refresh + animation**: `/races` page now delegates rendering to a new client component `RacesListClient.tsx` that uses SWR with `refreshInterval: 60_000` whenever any race is LIVE (otherwise no polling, just `revalidateOnFocus`). Race cards wrapped in framer-motion `motion.div` with `layoutId={race-card-${id}}` inside a `LayoutGroup` + `AnimatePresence` so a card glides between the Upcoming and Results sections when status flips, instead of disappearing/reappearing. Pure `isRaceLockedClient` inlined in the client component to avoid pulling Prisma across the RSC boundary. Initial server data is hydrated as `fallbackData` so first paint is identical to today. (3) **iOS auto-refresh + animation**: `RacesListViewModel` gains `hasLiveRace` + `silentRefresh()` (errors swallowed). Both `load()` and `silentRefresh()` wrap the `races =` assignment in `withAnimation(.spring(response: 0.45, dampingFraction: 0.85))` so List section reorders crossfade smoothly. View adds a second `.task(id: viewModel.hasLiveRace)` polling task that sleeps for 60s and silently refreshes only while a race is live and `scenePhase == .active`. Auto-cancels when the view leaves screen. (4) **COMPLETED-flip edge case**: `sync-schedule` no longer writes `status` on `update` — only on `create` (initial insert), and even then maps OpenF1's `finished` to LIVE rather than COMPLETED. Status transitions are now wholly owned by lock-picks (UPCOMING → LIVE) and ingest-results (LIVE → COMPLETED, after results are actually written). To compensate, `findRacesNeedingIngestion()` now also matches LIVE races whose `scheduledStartUtc < now - 3h` (the "race must be over by now" filter) so finished races still transition forward; `allowRaceResults` in the cron loop now permits status=LIVE. Eliminates the COMPLETED-without-results window that was producing empty "Results not yet available" cards.
- files touched: `src/app/(main)/races/page.tsx` (refactored to thin server wrapper), `src/app/(main)/races/RacesListClient.tsx` (new), `src/app/api/cron/sync-schedule/route.ts`, `src/lib/services/ingestion.service.ts`, `src/app/api/cron/ingest-results/route.ts`, `ios/FXRacing/Features/Races/RacesListView.swift`, `ios/FXRacing/Features/Races/RacesListViewModel.swift`, AWS EventBridge schedule `fx-ingest-results` (`rate(5 minutes)`)
- verification: `npx tsc --noEmit` clean; `npm run lint` clean; `npm run build` succeeded (`/races` size 3.31kB → 6.8kB due to client SWR + framer-motion); iOS `xcodebuild -sdk iphonesimulator build` BUILD SUCCEEDED. AWS `aws scheduler get-schedule` confirms `rate(5 minutes)` + `State: ENABLED` post-update.
- open questions: (1) The web List → ScrollView+LazyVStack migration was deliberately skipped on iOS — `withAnimation(.spring())` gives a smooth crossfade through SwiftUI's default List animations, not the matched-geometry "glide" effect web has. Acceptable polish gap. (2) The 3-hour stale-LIVE window in `findRacesNeedingIngestion` covers all main races (~2h) and sprints (~1h) with margin. If F1 ever runs a >3h session (unlikely), races could backfill late. (3) Concurrency lock from earlier today still wraps everything — multi-user safety preserved.
- should update architecture?: yes (status ownership now lock-picks + ingest-results only; sync-schedule is read-only on status; race-finish UX path includes web SWR polling and iOS Timer-based silent refresh)
- should update decisions?: no (no new architectural decision; just a tightening of the existing state machine)

### 2026-05-02 — Concurrency hardening + qualifying-results leaderboard
- by: Claude
- summary: Two independent workstreams. **(A) Concurrency fixes** for race-weekend multi-user load. (A1) `createOrUpdatePick` now runs in `db.$transaction` and replaces the unconditional upsert with a guarded `updateMany` whose WHERE re-asserts `lockedAt IS NULL AND race.lockCutoffUtc > now()` — closes the TOCTOU between the JS `isRaceLocked` check and the write. New `PickLockedError` thrown for both lock paths; existing `/api/picks` 423-locked mapping unchanged. P2002 on the create branch maps to a refresh-prompt error. (A2) `ingest-results` cron loop body wrapped in `db.$transaction` with `pg_try_advisory_xact_lock(hashtext(raceId))`; failed-lock invocations log SKIP and continue. To keep the lock and writes on the same connection, `ingestResultsForRace` and `computeAndStoreScoresForRace` now accept an optional `client: Prisma.TransactionClient | typeof db = db`. (A3) `sendFriendRequest` wrapped in `db.$transaction` with `pg_advisory_xact_lock` keyed on the *sorted* user-pair hash — prevents simultaneous A→B + B→A from creating two PENDING rows. **(B) Qualifying results leaderboard.** New `QualifyingResult` model + `openf1QualifyingSessionKey: Int? @unique` on Race (Driver gets `qualifyingResults` back-relation). `sync-schedule` now pairs each Race row with the latest Qualifying session in the same `meetingKey` whose `scheduledStartUtc < race.scheduledStartUtc` — works for both non-sprint (single Q) and sprint weekends (Sprint Shootout pairs with Sprint, Main Q pairs with Main). New `src/lib/services/qualifying.service.ts` with `getQualifyingResults`, `ingestQualifyingForRace`, `findRacesNeedingQualifyingIngestion`. `ingest-results` cron extended: target list unions both ingestion-needs queries; per-race tx now also calls qualifying ingestion (always, even when race is UPCOMING) and only runs race-result/scoring when `status===COMPLETED || mode==='force' || mode==='targeted'`. New `<QualifyingResultsCard>` (no scoring, header text MAIN/SPRINT-aware) renders below `<PickHero>` pre-race and below `<RaceResultsCard>` post-race when `qualifyingResults.length > 0`. **(C) iOS** unchanged — qualifying card is web-only this release; brief allowed iOS to lag.
- files touched: `prisma/schema.prisma`, `src/lib/services/pick.service.ts`, `src/lib/services/friendship.service.ts`, `src/lib/services/ingestion.service.ts`, `src/lib/services/scoring.service.ts`, `src/lib/services/qualifying.service.ts` (new), `src/app/api/cron/sync-schedule/route.ts`, `src/app/api/cron/ingest-results/route.ts`, `src/app/(main)/races/[raceId]/page.tsx`, `src/components/race/QualifyingResultsCard.tsx` (new)
- verification: `npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` succeeded (28/28 pages, all routes generated). `prisma generate` ran. **`npm run db:push` was BLOCKED by permission system — schema changes (new column + new table) NOT yet applied to dev or prod DB.** Until pushed, the qualifying card will silently render nothing (the service returns `[]` against the not-yet-existent table → query failure mode TBD; should error before reaching the card via Prisma type mismatch). Code-level changes for A1/A2/A3 do not depend on schema changes and are immediately deployable.
- open questions: (1) User must authorize `npm run db:push` (and run it against prod after deploy) before B is usable. (2) Manual two-tab test of A1 against staging recommended before declaring race-weekend safe. (3) After deploy, fire `POST /api/cron/sync-schedule` once with Bearer CRON_SECRET to populate `openf1QualifyingSessionKey` on existing Race rows. Then `POST /api/cron/ingest-results` (or wait for the next scheduled tick) to backfill any qualifying sessions already complete (Miami Sprint Shootout if it has finished by then). (4) iOS qualifying view deferred to next release.
- should update architecture?: yes (new QualifyingResult model + service + qualifying ingestion path in cron pipeline; PickLockedError; advisory-lock pattern for cron and friend requests)
- should update decisions?: yes (advisory-lock approach for cron re-entrancy; transactional pick write with DB-level lock guard)

### 2026-05-01 22:15 — AWS cron IAM repair + lock-picks CANCELLED-race bug
- by: Claude
- summary: Discovered the AWS Lambda crons (`fx-cron-orchestrator` in us-east-1, account 031363453617) had not fired since 2026-04-06. Root cause: the IAM role `scheduler-lambda-role` used by EventBridge Scheduler had ZERO permissions — trust policy let Scheduler assume it, but no `lambda:InvokeFunction` policy. Schedules showed ENABLED while every fire silently failed. Three schedules in EventBridge Scheduler (NOT Rules — separate service): `fx-lock-picks` rate(5m), `fx-ingest-results` rate(30m), `fx-sync-schedule` cron(5 0 * * ? *). Fix: attached inline policy `InvokeCronOrchestrator` to the role, scoped to the one Lambda ARN. Crons resumed firing immediately. SECONDARY BUG surfaced on first scheduled run: `lock-picks` `where` clause used `status: { not: "COMPLETED" }`, which matched CANCELLED races whose start time had passed — the LIVE-flip block then overwrote Saudi Arabian GP, Bahrain Sprint, Bahrain GP from CANCELLED to LIVE. Fixed by switching to allowlist `status: { in: ["UPCOMING", "LIVE"] }` and ran `scripts/restore-cancelled-races.ts` to flip the three races back to CANCELLED. Three subsequent lock-picks fires (20:00 / 20:05 / 20:10 UTC) all show `lockedRaces: 0` confirming fix held.
- files touched: `src/app/api/cron/lock-picks/route.ts`, `scripts/restore-cancelled-races.ts` (new), AWS IAM `scheduler-lambda-role` (added inline policy `InvokeCronOrchestrator`)
- verification: tsc clean, lint clean, push deployed via Vercel; CloudWatch confirms three post-deploy lock-picks fires with lockedRaces=0 (vs lockedRaces=3 on the pre-fix 19:40 run that triggered the bug); /api/races confirms three races back to CANCELLED.
- open questions: None blocking. The three Claude scheduled routines (Sat/Sun) now have a working primary pipeline to safety-net rather than substitute for.
- should update architecture?: yes (cron infra notes — Lambda + EventBridge Scheduler + scheduler-lambda-role with InvokeCronOrchestrator inline policy)
- should update decisions?: no

### 2026-05-01 20:35 — Pre-Miami-Sprint observability instrumentation
- by: Claude
- summary: Added end-to-end logging + diagnostic endpoints so the user can troubleshoot the Miami Sprint pipeline (lock-picks → ingest-results → compute-scores) externally Saturday without live debug. (1) New iOS `Core/Logger.swift` — ring-buffer (last 500 entries) that mirrors to `os.Logger` with subsystem `com.fxracing.app` and per-feature categories (network/auth/race/pick/score/sync/ui). Wired into APIClient (every request: method, path, status, ms, bytes, auth-presence), AuthManager (restoreSession + signInWithApple lifecycle), RaceDetailViewModel (load + submit; flags COMPLETED-but-no-results and missing-driver in server picks), LeaderboardViewModel, FriendProfileViewModel, SyncManager (per-pick migration outcome). (2) New `Features/Profile/DiagnosticsView.swift` accessible via "View logs" row added to BOTH `SettingsView` (auth) and `GuestProfileView` (guest) — category filter chips, color-coded levels, Copy/Share/Clear menu, monospaced text-selectable rows. External testers can now email logs without USB-tethered Console. (3) Server-side tagged `[f10:cron:lock|ingest|scores]` and `[f10:ingest|score]` console logs at every step in cron routes + ingestion.service + scoring.service — visible in Vercel runtime logs, greppable. (4) New `/api/diag/race/[id]` (Bearer CRON_SECRET) returning race + entry/result/pick/score counts + status breakdown + auto-detected pipeline issues (no openf1SessionKey, COMPLETED-without-results, partial scoring, lockCutoff-passed-but-status-still-UPCOMING, etc). (5) New `/api/diag/health` (Bearer CRON_SECRET) returning a one-screen race-weekend snapshot — next 3 upcoming + last 3 completed races, each with the same pipeline checks. Curl-able from a phone via Shortcuts.
- files touched: `ios/FXRacing/Core/Logger.swift` (new), `ios/FXRacing/Features/Profile/DiagnosticsView.swift` (new), `ios/FXRacing/Core/Networking/APIClient.swift`, `ios/FXRacing/Core/Auth/AuthManager.swift`, `ios/FXRacing/Core/Sync/SyncManager.swift`, `ios/FXRacing/Features/Races/RaceDetailViewModel.swift`, `ios/FXRacing/Features/Rankings/LeaderboardViewModel.swift`, `ios/FXRacing/Features/Profile/FriendProfileViewModel.swift`, `ios/FXRacing/Features/Profile/SettingsView.swift`, `ios/FXRacing/Features/Profile/GuestProfileView.swift`, `ios/FXRacing.xcodeproj/project.pbxproj`, `src/app/api/cron/lock-picks/route.ts`, `src/app/api/cron/ingest-results/route.ts`, `src/app/api/cron/compute-scores/route.ts`, `src/lib/services/ingestion.service.ts`, `src/lib/services/scoring.service.ts`, `src/app/api/diag/race/[id]/route.ts` (new), `src/app/api/diag/health/route.ts` (new)
- verification: `npx tsc --noEmit` clean; `npm run lint` clean; `npm run build` succeeded — `/api/diag/health` and `/api/diag/race/[id]` both compile and appear in the route table. iOS `xcodebuild -sdk iphonesimulator build` BUILD SUCCEEDED on iPhone 17 sim. App relaunched against prod and `xcrun simctl spawn booted log show --predicate 'subsystem == "com.fxracing.app"'` captures structured entries (`restoreSession: no keychain token → guest`, `GET /api/races → 200 (3518ms, 9592B, anon)`). Local dev test of `/api/diag/health` with valid CRON_SECRET returns Miami Sprint (UPCOMING, 22 entries, 2 picks, 0 results, healthy) + Miami GP + Emilia-Romagna + last 3 completed; wrong Bearer correctly 401s.
- open questions: New endpoints + iOS logging won't help Saturday until deployed to prod and rebuilt iOS is on TestFlight/App Store. iOS portion can also live in a sideloaded debug build for the user's own phone.
- should update architecture?: yes (new diag endpoints + Logger should appear in API surface and iOS folder map)
- should update decisions?: no

### 2026-05-01 19:55 — Username flow hardening for Apple review
- by: Claude
- summary: Three targeted fixes after end-to-end audit + prod API smoke test for Miami GP weekend. (1) `setUsername`/`changeUsername` now return the *stored* (lowercased) username so iOS optimistic state matches what `/api/users/me` will return on next launch — eliminates the case-flicker after relaunch. (2) iOS `submit()` no longer resets `availability = .idle` on transient (non-409) errors; the Confirm button stays enabled for retry instead of dead-ending the user (they previously had to retype to re-trigger the availability check). (3) iOS now re-fetches username suggestions whenever availability flips to `.taken` (during typing OR after a 409 submit) so a working alternative is always one tap away — addresses the "Apple reviewers retype the same names across reviews and hit DB-pollution collisions" pattern. Build number bumped 2 → 3 for the next App Store upload.
- files touched: `src/lib/services/user.service.ts`, `src/app/api/users/username/route.ts`, `ios/FXRacing/Features/Onboarding/UsernamePickerViewModel.swift`, `ios/project.yml`, `ios/FXRacing.xcodeproj/project.pbxproj`
- verification: `npx tsc --noEmit` clean; `npm run lint` clean; `npm run build` succeeded; iOS `xcodebuild -sdk iphonesimulator build` BUILD SUCCEEDED on iPhone 17 sim; app installed and launched into Races (guest mode) successfully against prod API. Prod API smoke: `/api/races` returns 32 races (Miami Sprint 2026-05-02, Miami GP 2026-05-03 both UPCOMING), race detail decodes cleanly, `/api/users/username?username=…` 200, `/api/users/suggest-usernames` 200, auth-protected routes return proper 401 with bad Bearer (not 307).
- open questions: Production DB still has stale review-test usernames (per 2026-04-23 entry — `testapple` etc). The suggestion-refresh fix mitigates this client-side, but a one-time production cleanup of orphaned/test User rows would also help. Requires explicit destructive-data approval.
- should update architecture?: no
- should update decisions?: no

### 2026-04-30 09:30 — Fix Apple review hang on username Confirm
- by: Claude
- summary: App Review reported the username picker became unresponsive after tapping Confirm. Three changes: (1) removed the confirmation alert added in 9e737d0 — the helper text under the title already warns about the one-time change, and the alert+`Task` pattern was the only thing that changed between Apple's prior approval and the recent rejections; (2) optimistic local state update in `AuthManager.setUsername`/`changeUsername` — the second `GET /me` roundtrip is gone, RootView swaps to MainTabView as soon as the POST returns; (3) confirm button keeps the red accent background and white spinner during submit so it's clearly visibly working (was gray-on-gray, looked frozen). Bumped MARKETING_VERSION to 1.4.
- files touched: `ios/FXRacing/Features/Onboarding/UsernamePickerView.swift`, `ios/FXRacing/Core/Auth/AuthManager.swift`, `ios/FXRacing/Core/Models/User.swift`, `ios/FXRacing.xcodeproj/project.pbxproj`, `ios/project.yml`
- verification: `xcodebuild -project FXRacing.xcodeproj -scheme FXRacing -destination 'generic/platform=iOS Simulator' build` → BUILD SUCCEEDED. Production endpoints curl-tested: `POST /api/users/username` 401 in ~200ms, `GET /api/users/me` 401 in ~170ms — backend is fast, the slowness was always the double-roundtrip.
- open questions: User must bump `CURRENT_PROJECT_VERSION` (build number) before the next App Store upload — Apple rejects duplicate build numbers.
- should update architecture?: no
- should update decisions?: no

### 2026-04-26 18:10 — Scoring source-of-truth cleanup
- by: Codex
- summary: Centralized race scoring constants, changed sprint P10 max to 8, added server score-guide fields for result-row previews, and aligned iOS completed-race result rows with server-provided preview scoring instead of local formula math.
- files touched: `src/lib/scoring/formula.ts`, `src/app/api/races/[id]/route.ts`, `ios/FXRacing/Features/Races/RaceDetailView.swift`, `ios/FXRacing/Core/Models/Pick.swift`, `ios/FXRacing/Core/Models/Race.swift`
- verification: `npx tsc --noEmit`; focused `npx tsx` formula check for P1-P20 main/sprint + DNF/DNS/DSQ; `npm run lint`; `npm run build`; iOS `xcodebuild ... -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/FXRacingDerivedData build`
- open questions: After deploy, call `POST /api/cron/compute-scores` with `{ "raceType": "SPRINT" }` and `Authorization: Bearer CRON_SECRET` to recompute stored sprint scores.
- should update architecture?: yes
- should update decisions?: yes

### 2026-04-23 09:42 — iOS username availability race fix
- by: Codex
- summary: Fixed iOS onboarding so stale username availability responses cannot mark the current text available; submit now only enables for the exact checked username and 409 submit failures flip the UI to taken. Username availability/suggestion API GETs are force-dynamic with no-store headers. DB inspection confirmed `testapple` exists in production, so the red submit error was correct and the green availability state was stale.
- files touched: `ios/FXRacing/Features/Onboarding/UsernamePickerViewModel.swift`, `src/app/api/users/username/route.ts`, `src/app/api/users/suggest-usernames/route.ts`
- verification: `npx tsc --noEmit`; `npm run lint`; `npm run build`; iOS `xcodebuild ... -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/FXRacingDerivedData build` passed outside sandbox.
- open questions: Whether to delete old App Review test accounts/usernames from production requires an explicit destructive-data decision.
- should update architecture?: no
- should update decisions?: no

### 2026-04-15 — ai-system framework integration
- by: Claude
- summary: Integrated ai-system shared-docs framework into f10_fantasy as pilot project. Added ai/docs/ structure, updated CLAUDE.md with read-order + shared-docs protocol, created AGENTS.md.
- files touched: CLAUDE.md, AGENTS.md, ai/docs/architecture.md, ai/docs/decisions.md, ai/docs/worklog.md, ai/docs/ai-workflow.md
- verification: File structure matches ai-system template; architecture.md populated from existing CLAUDE.md content; decisions.md reflects accepted technical choices.
- open questions: None.
- should update architecture?: no
- should update decisions?: no

### 2026-04-15 — P10 scoring fix: superseded
- by: Claude
- summary: Historical note only; current scoring source of truth is the 2026-04-26 entry and `ai/docs/decisions.md`.
- files touched: `src/lib/scoring/formula.ts`, `src/components/race/RaceResultsCard.tsx`
- verification: Unit-checked formula manually against grid positions.
- open questions: None.
- should update architecture?: no
- should update decisions?: yes → added to decisions.md

### 2026-04-15 — Race Results collapsed to single pts column
- by: Claude
- summary: RaceResultsCard UI simplified to collapse multiple point columns into one `pts` column.
- files touched: `src/components/race/RaceResultsCard.tsx`
- verification: Visual only — no logic changed.
- open questions: None.
- should update architecture?: no
- should update decisions?: no
