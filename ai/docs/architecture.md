# Architecture

## Purpose
Pre-digested codebase map. Use this instead of scanning the repo.
If something important is missing: inspect only the necessary files, then update this document.

## Maintenance Rule
Update when entry points, major modules, API surface, data flow, or key constraints change.
Keep it concise and high-signal.

## Current Status
- Status: active
- Last updated: 2026-04-15
- Updated by: Claude
- Confidence level: high

---

## High-Level Overview
F10 Fantasy is a Formula 1 fantasy pick'em web app (Next.js 14, App Router).
- Users pick: race Winner, P10 finisher, DNF driver — scored per formula below.
- Stack: Next.js 14 App Router + TypeScript, PostgreSQL + Prisma ORM, Auth.js v5 (JWT), Tailwind CSS + Radix UI
- External data: OpenF1 API (race schedule, entrants, results)
- Deployment: Vercel. Cron jobs: AWS Lambda → POST to `/api/cron/*` routes.

---

## Layered Structure (CRITICAL)

```
Client Components / RSC Pages
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
- Route group — auth flows: `src/app/(auth)/`
- Route group — main app: `src/app/(main)/`

### Backend
- API routes: `src/app/api/`
- Cron routes: `src/app/api/cron/` (Bearer `CRON_SECRET`)
- Middleware (auth/guest gating): `src/middleware.ts`

### Key Pages
| Route | File | Notes |
|---|---|---|
| `/races` | `src/app/(main)/races/page.tsx` | Race list, guest-accessible |
| `/races/[raceId]` | `src/app/(main)/races/[raceId]/page.tsx` | Active: picks UI. Completed: results + scores |
| `/leaderboard` | `src/app/(main)/leaderboard/page.tsx` | Global + Friends tabs |
| `/profile` | `src/app/(main)/profile/page.tsx` | Auth-required, team picker |
| `/profile/[userId]` | `src/app/(main)/profile/[userId]/page.tsx` | Public, SWR client fetch |

---

## Core Modules

| Path | Purpose |
|---|---|
| `src/lib/services/race.service.ts` | `getRaceById`, `getRaceEntrants`, `getRaceResults`, `getRacesForSeason`, `getActiveSeason` |
| `src/lib/services/pick.service.ts` | `getPickForRace`, `getPickedRaceIds`, `getPicksForSeason`, `createOrUpdatePick` |
| `src/lib/services/ingestion.service.ts` | `ingestResultsForRace` → fetches OpenF1 → upserts `RaceResult` |
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
1. Page (`/races/[raceId]`) server-fetches race + entrants + user pick
2. Renders `<PickHero>` (client) with entrants
3. User selects drivers via `DriverSheet` bottom sheet
4. Save button → `POST /api/picks` → `createOrUpdatePick`

### Results (completed race)
1. Cron: `ingest-results` → `ingestResultsForRace` → upserts `RaceResult` rows
2. Cron: `computeAndStoreScoresForRace` → writes scores to DB
3. Page server-fetches `getRaceResults` → builds `heroResults` (structured) + `displayResults` (flat)
4. Renders `<HeroVisualization>` + `<PicksDisplay>` + `<RaceResultsCard>`

---

## API Surface

- `POST /api/picks` — submit pick (auth required)
- `GET /api/races` — public race list
- `GET /api/users/[userId]` — public user profile + picks
- `GET /api/friends` — friend list (auth required)
- `POST /api/friends` — send friend request (auth required)
- `POST /api/cron/sync-schedule` — weekly full F1 season sync
- `POST /api/cron/sync-entries` — hourly race entry refresh
- `POST /api/cron/lock-picks` — daily pick lock
- `POST /api/cron/ingest-results` — daily result ingestion + scoring
- `GET  /api/diag/health` — Bearer CRON_SECRET; race-weekend snapshot (next 3 upcoming + last 3 completed, with pipeline issues flagged)
- `GET  /api/diag/race/[id]` — Bearer CRON_SECRET; per-race pipeline diagnostic (entry/result/pick/score counts + auto-detected issues)

---

## Key Constraints

- **Three parallel type systems** — Domain types (`src/types/domain.ts`), Prisma types (DB-only, never leak to client), F1 types (`src/lib/f1/types.ts`). Keep them separate.
- **Serialization pattern** — `Date` fields cannot cross RSC/client boundary. Client components receive `Serialized*` variants with dates as ISO strings.
- **PickSet** unique on `[userId, raceId]` — one pick set per user per race
- **Race** unique on `[seasonId, round, type]` — separates MAIN and SPRINT
- **Two lock levels** — `race.lockCutoffUtc` (race-wide) + `pickSet.lockedAt` (individual)
- **Cron jobs are NOT Vercel crons** — they are AWS Lambda functions; no cron config lives in this repo
- **Completed races are immutable** — `sync-schedule` and `sync-entries` never touch them
- **No test framework** — verify via type checking, linting, and build

---

## Scoring Formula

| Pick | Main Race | Sprint |
|---|---|---|
| P10 | table by distance from P10: `25,18,15,12,10,8,6,4,2,0...` | `max(0, 8 - |pos-10|)` |
| Winner bonus | +5 | +2 |
| DNF bonus | +3 | +1 |

Only CLASSIFIED drivers count for position scoring.

---

## Common Patterns

- Service layer owns all business logic — API routes are thin wrappers
- `resolveTeam()` + `DRIVER_PHOTOS` are injected in `getRaceEntrants()` — never at the component level
- Guest access: middleware allows public routes; pages handle `userId = null` gracefully
- Client components that need data use SWR; server components use direct service calls
- Zod is the validation standard at API boundaries

---

## Static Assets

- Driver headshots: `public/drivers/{lastName}.png` — pre-cropped circular, use `object-center`
- Team logos: `public/teamlogos/{slug}.webp` — white logos on team-color background
- Two drivers have no photo (Doohan #7, Tsunoda #22) — fall back to initials on team color

---

## Commands

```bash
npm run dev          # localhost:3000
npm run build        # production build
npm run lint         # ESLint
npm run db:push      # sync Prisma schema (no migrations)
npm run db:studio    # Prisma Studio GUI
```

---

## Update Log

### 2026-05-01
- Added `/api/diag/health` and `/api/diag/race/[id]` (Bearer CRON_SECRET) for race-weekend pipeline troubleshooting
- iOS gained `Core/Logger.swift` (os.Logger + 500-entry ring buffer) + `Features/Profile/DiagnosticsView.swift`, exposed via "View logs" rows in Settings and Guest profile
- reason: Miami Sprint is the first scored race; cron pipeline (lock-picks → ingest-results → compute-scores) needs external observability since the user can't always debug live

### 2026-04-15
- Created from existing CLAUDE.md as part of ai-system integration
- reason: establish shared ai/docs memory layer for cross-model consistency
