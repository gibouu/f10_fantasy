# Architecture

## Purpose
Pre-digested codebase map. Use this instead of scanning the repo.
If something important is missing: inspect only the necessary files, then update this document.

## Maintenance Rule
Update when entry points, major modules, API surface, data flow, or key constraints change.
Keep it concise and high-signal.

## Current Status
- Status: active
- Last updated: 2026-07-15
- Updated by: Codex
- Confidence level: high

---

## High-Level Overview
FX Racing is an iOS-first Formula 1 fantasy pick'em backed by a Next.js 14 API and a static marketing/legal web surface.
- iOS users pick: race Winner, P10 finisher, DNF driver — scored per formula below.
- Backend stack: Next.js 14 App Router + TypeScript, PostgreSQL + Prisma ORM, Auth.js v5 (JWT)
- Public web stack: static Next.js pages with local CSS/assets; no browser product UI, auth provider, or runtime data fetch
- iOS stack: Swift 6 + SwiftUI, iOS 17+, with an iOS 26 Liquid Glass compatibility boundary
- External data: OpenF1 API (race schedule, entrants, results)
- Deployment: Vercel. Cron jobs: AWS Lambda/EventBridge -> POST to `/api/cron/*` routes.

---

## Layered Structure (CRITICAL)

```
iOS Client / API Consumers
  → API Routes (Next.js, validation via Zod)
    → Service Layer (src/lib/services/) — all business logic
      → Pure Functions (src/lib/scoring/formula.ts) — scoring math, no DB
      → Prisma ORM (src/lib/db/client.ts) → PostgreSQL
      → F1 Provider (src/lib/f1/) → OpenF1 API
```

---

## Entry Points

### Frontend
- App root: `src/app/layout.tsx`
- Static landing: `src/app/page.tsx`
- Static legal/support: `src/app/privacy/page.tsx`, `src/app/support/page.tsx`
- Retired browser-product redirects: `next.config.mjs`

### Backend
- API routes: `src/app/api/`
- Cron routes: `src/app/api/cron/` (Bearer `CRON_SECRET`)
- Middleware (auth/guest gating): `src/middleware.ts`

### iOS
- App root: `ios/FXRacing/FXRacingApp.swift`
- Persistent shell: `ios/FXRacing/Features/Home/MainShellView.swift`
- Race experience: `RaceDeckView` + `RaceDeckViewModel` render separate Upcoming/Past swipe decks; schedule, driver selection, and ranking-player profiles use dismissible native sheets, while the persistent shell avoids an outer `NavigationStack`
- Public race data: `RaceRepository` owns stale-while-revalidate list/detail snapshots, single-flight requests, and a two-race prefetch cohort
- Private picks: `LocalPickStore` persists owner-scoped, revisioned records; `SyncManager` leases and orchestrates the outbox separately from authoritative server picks
- Images: one injected `FXImagePipeline` provides size-aware decoded-memory caching, disk-backed response caching, and bounded loading; views do not instantiate `AsyncImage`

### Key Pages
| Route | File | Notes |
|---|---|---|
| `/` | `src/app/page.tsx` | Static App Store landing page |
| `/privacy` | `src/app/privacy/page.tsx` | Static privacy policy and terms |
| `/support` | `src/app/support/page.tsx` | Static support page |

The retired `/races`, `/leaderboard`, `/picks`, `/profile`, `/signin`, and `/onboarding/*` browser routes redirect temporarily to `/`. Their API equivalents remain available to the native app.

---

## Core Modules

| Path | Purpose |
|---|---|
| `src/lib/services/race.service.ts` | `getRaceById`, `getRaceEntrants`, `getRaceResults`, `getRacesForSeason`, `getActiveSeason` |
| `src/lib/services/pick.service.ts` | `getPickForRace`, `getPickedRaceIds`, `getPicksForSeason`, `createOrUpdatePick`; profile history hides `CANCELLED` races |
| `src/lib/services/ingestion.service.ts` | `ingestResultsForRace` → fetches OpenF1 → upserts `RaceResult` |
| `src/lib/services/qualifying.service.ts` | `ingestQualifyingForRace`, `getQualifyingResults`, partial-row qualifying backfill |
| `src/lib/services/driver-season-stats.ts` | Per-driver average classified finish and non-classified count from earlier completed same-season, same-type races |
| `src/lib/services/scoring.service.ts` | `computeAndStoreScoresForRace` — requires results in DB first |
| `src/lib/services/leaderboard.service.ts` | `getGlobalLeaderboard`, `getFriendsLeaderboard`, `getUserSeasonRank` |
| `src/lib/services/user.service.ts` | Username, favorite team |
| `src/lib/services/lock.service.ts` | `isRaceLocked`, `isPickSetLocked` |
| `src/lib/scoring/formula.ts` | Pure scoring math — no DB, no side effects |
| `src/lib/f1/teams.ts` | `DRIVER_PHOTOS`, `TEAMS`, `resolveTeam()` |
| `src/lib/db/client.ts` | Prisma client singleton |
| `src/types/domain.ts` | Domain types — safe for client and server |
| `src/lib/f1/types.ts` | F1 provider types — internal to F1 layer only |

---

## Data Flow

### Active race pick
1. The iOS client fetches race detail, entrants, and the current pick from the public/native API surface.
2. The native race deck presents the three driver selections.
3. Save submits `POST /api/picks` → `createOrUpdatePick`.

### Results (completed race)
1. Cron: `ingest-results` → `ingestResultsForRace` → upserts `RaceResult` rows
2. Cron: `computeAndStoreScoresForRace` → writes scores to DB
3. Native API routes serialize completed results, picks, and scores.
4. The iOS client renders the completed-race result and ranking views.

### Qualifying + Early-Bird Bonus
1. `sync-schedule` pairs each race with the latest qualifying session before race start and stores `openf1QualifyingSessionKey` + `qualifyingStartUtc`
2. `ingest-results` also runs qualifying ingestion from OpenF1 `/session_result`
3. `lock-picks` snapshots whether each pick was last edited before `Race.qualifyingStartUtc`
4. Scoring adds `ScoreBreakdown.earlyBirdBonus = baseScore` when that snapshot is true

### iOS race deck
1. The shell publishes the cached race list immediately, then refreshes it without replacing the deck with a blocking loader.
2. Upcoming and Past each keep an independent centered selection; horizontal paging changes the active race instead of navigating to a new page.
3. The selected race publishes cached public detail and the owner-scoped local draft immediately; public refresh and any authenticated server-pick request run concurrently. Obsolete work is generation guarded and canceled by lifecycle/scope ownership.
4. Only the active race and its next neighbor may retain detail/image prefetch work. Visible-request waiter accounting demotes or cancels work after rapid swipes.
5. Before qualifying rows exist, Upcoming shows season form from optional race-detail entrant fields; qualifying replaces it when available. This does not load previous-race detail.
6. P1, P10, and DNF remain the complete gameplay. The progressive driver sheet advances through all three; saves are local-first and the server remains authoritative for lock/conflict/score state.
7. While active, the shell polls race status every 60 seconds, including before a race is live. Status publication revalidates the selected live detail; foreground public-race and account refreshes run independently.

---

## API Surface

- `GET /api/picks?raceId=<id>` — fetch authenticated user's pick; response includes `pick.version` (same value as `updatedAt.toISOString()`) and an `ETag`
- `POST /api/picks` — submit pick (auth required); existing-row edits require `If-Match: "<pick.version>"` or body `baseVersion`, stale/missing versions return HTTP 409 with `{ currentPick }`
- `GET /api/races` — public race list
- `GET /api/races/[id]` — public race detail, including qualifying results and optional entrant season-form fields
- `GET /api/users/[userId]` — public user profile + picks
- `GET /api/friends` — friend list (auth required)
- `POST /api/friends` — send friend request (auth required)
- `POST /api/cron/sync-schedule` — full F1 season sync; external cadence in `ai/docs/cron-operations.md`
- `POST /api/cron/sync-entries` — race entry refresh; external cadence in `ai/docs/cron-operations.md`
- `POST /api/cron/lock-picks` — pick locking; external cadence in `ai/docs/cron-operations.md`
- `POST /api/cron/ingest-results` — result ingestion + scoring; external cadence in `ai/docs/cron-operations.md`
- `POST /api/cron/compute-scores` — targeted score recompute; protected by `CRON_SECRET`
- `GET  /api/diag/health` — Bearer CRON_SECRET; race-weekend snapshot (next 3 upcoming + last 3 completed, with pipeline issues flagged)
- `GET  /api/diag/race/[id]` — Bearer CRON_SECRET; per-race pipeline diagnostic (entry/result/pick/score counts + auto-detected issues)

---

## Key Constraints

- **Three parallel type systems** — Domain types (`src/types/domain.ts`), Prisma types (DB-only, never leak to client), F1 types (`src/lib/f1/types.ts`). Keep them separate.
- **Serialization pattern** — `Date` fields cannot cross JSON or RSC/client boundaries. API/native-facing shapes use `Serialized*` variants with dates as ISO strings.
- **PickSet** unique on `[userId, raceId]` — one pick set per user per race
- **Pick optimistic concurrency** — API pick responses expose `version = updatedAt.toISOString()`. Cross-device edits must send the loaded version via `If-Match` or `baseVersion`; `pick.service.ts` compares it inside the write transaction before updating.
- **Race** unique on `[seasonId, round, type]` — separates MAIN and SPRINT
- **Race ordering is chronological** — service lists/current-race queries sort by `scheduledStartUtc`, not round number. Round labels may be manually renumbered after calendar reconciliation; cancelled rows may be parked at high round values to avoid unique-key collisions.
- **Two lock levels** — `race.lockCutoffUtc` (race-wide) + `pickSet.lockedAt` (individual)
- **Three-layer post-lock pick protection** — (1) `pick.service.ts` atomic write guard rejects post-lock writes; (2) `lockPicksForRace` snapshots driver/seat into `PickSet.locked*` cols and `scoring.service.ts` reads from those, so scoring uses the pre-lock state regardless of any later live-field drift; (3) Postgres trigger `pickset_post_lock_guard` refuses any UPDATE mutating driver/seat fields on a locked row. Trigger lives in `prisma/triggers/` and must be re-installed via `scripts/install-pickset-triggers.ts` after DB resets.
- **Early-bird scoring is snapshot-based** — `PickSet.lockedSubmittedBeforeQualifying` is set during `lock-picks`; scoring never recomputes that flag from mutable timestamps later.
- **Cron jobs are NOT Vercel crons** — they are AWS Lambda/EventBridge schedules; canonical runbook: `ai/docs/cron-operations.md`
- **Completed races are immutable** — `sync-schedule` and `sync-entries` never touch them
- **Regression tests use Node's built-in test runner** — package scripts group route, auth, service, component, page, scoring, iOS-source, and script checks. Use targeted `node --test ...` suites first, then `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
- **iOS private state is owner-scoped** — detail view-model caches and persisted pick records include the current account/device scope. Account changes cancel and evict the previous scope before rendering another user's state.
- **iOS sync work is session-leased** — a worker is bound to the validated user, token, and session UUID. Invalidation cancels it, requeues captured syncing rows, and rejects stale responses/401s from older sessions.
- **iOS server picks are authoritative** — local drafts/outbox rows never replace official scored selections. Private 404, 423, legacy-device, and conflict states have explicit repair/review flows.
- **iOS performance fixtures cannot ship** — deterministic UI fixtures compile only in the `Performance` configuration. `scripts/ios-performance` gates exact-count app-owned spans: normal `simctl` launches for launch/cache and XCTest signposts for interactions. UI-automation wall time is exported only as a diagnostic.

---

## Scoring Formula

| Pick | Main Race | Sprint |
|---|---|---|
| P10 | table by distance from P10: `25,18,15,12,10,8,6,4,2,0...` | `max(0, 8 - |pos-10|)` |
| Winner bonus | +5 | +2 |
| DNF bonus | +3 | +1 |

Only CLASSIFIED drivers count for position scoring.
If `lockedSubmittedBeforeQualifying` is true, `earlyBirdBonus` duplicates the base score, making the stored total effectively 2x.

---

## Common Patterns

- Service layer owns all business logic — API routes are thin wrappers
- API routes that parse JSON object bodies use `src/lib/api/request-body.js` before destructuring request data
- API routes map thrown errors with `src/lib/api/errors.js`: allowlist domain messages, log unexpected errors, return generic 500 bodies
- API route regressions use the handler-injection pattern documented in `ai/docs/route-testing.md`
- `getRaceEntrants()` returns the union of `RaceEntry`, `RaceResult`, and `QualifyingResult` drivers so substitute drivers who actually drove render correctly. `resolveTeam()` + `DRIVER_PHOTOS` are injected there, never at the consumer/UI layer.
- Public profile pick history excludes picks attached to `CANCELLED` races. Rows remain in the DB for audit, but hidden races do not appear as dead picks.
- Guest access: public read APIs handle `userId = null` gracefully; static web routes do not read sessions
- Static marketing/legal pages do not import auth, database, service, or runtime-fetch code; iOS consumes the preserved API surface
- Zod is the validation standard at API boundaries

---

## Static Assets

- Driver headshots: `public/drivers/{lastName}.png` — server/native asset contract referenced by API responses; preserve independently of the retired browser UI
- Team logos: `public/teamlogos/{slug}.webp` — server/native asset contract referenced by API responses; preserve independently of the retired browser UI
- Two drivers have no photo (Doohan #7, Tsunoda #22) — fall back to initials on team color

---

## Commands

```bash
npm run dev          # localhost:3000
npm run build        # production build
npm run lint         # ESLint
npm run db:push      # sync Prisma schema (no migrations)
npm run db:studio    # Prisma Studio GUI
vercel --version     # local Vercel CLI should be 54.15.0 or newer
```

---

## Update Log

### 2026-07-15
- Replaced the browser product surface with static marketing, privacy, and support pages; exact legacy browser routes redirect to the landing page
- Removed the browser-only route/component tree while preserving APIs, Auth.js handlers/callbacks, scoring, cron, database services, and native driver/team asset contracts

### 2026-07-14
- Replaced the native iOS race list/detail navigation with cached-first centered race decks and native sheets
- Added owner-scoped pick authority, bounded request/image prefetch, Liquid Glass compatibility surfaces, and a deterministic Performance-only measurement harness
- reason: keep the three-pick game unchanged while making the App Store experience faster, smoother, and closer to Apple Sports

### 2026-05-01
- Added `/api/diag/health` and `/api/diag/race/[id]` (Bearer CRON_SECRET) for race-weekend pipeline troubleshooting
- iOS gained `Core/Logger.swift` (os.Logger + 500-entry ring buffer) + `Features/Profile/DiagnosticsView.swift`, exposed via "View logs" rows in Settings and Guest profile
- reason: Miami Sprint is the first scored race; cron pipeline (lock-picks → ingest-results → compute-scores) needs external observability since the user can't always debug live

### 2026-04-15
- Created from existing CLAUDE.md as part of ai-system integration
- reason: establish shared ai/docs memory layer for cross-model consistency
