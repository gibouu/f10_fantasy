# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run db:push      # Sync Prisma schema to DB (no migrations — direct push)
npm run db:studio    # Open Prisma Studio GUI
```

No test framework is configured.

---

## Architecture

**Stack**: Next.js 14 App Router, TypeScript, PostgreSQL + Prisma ORM, Auth.js v5 (JWT), Tailwind CSS + Radix UI, OpenF1 API for F1 data.

### Layered Structure

```
Client Components / Pages (RSC)
  → API Routes (Next.js server functions, validation via Zod)
    → Service Layer (src/lib/services/) — all business logic
      → Pure Functions (src/lib/scoring/formula.ts) — scoring math, no DB
      → Prisma ORM (src/lib/db/client.ts) → PostgreSQL
      → F1 Provider (src/lib/f1/) → OpenF1 API
```

---

## Route Groups

- `src/app/(auth)/` — signin, onboarding/username (separate layout, no nav bar)
- `src/app/(main)/` — pages; layout adds sticky header + bottom tab nav. Most pages support **guest access** (no auth required for read-only)
- `src/app/api/cron/` — background jobs; protected by `Authorization: Bearer CRON_SECRET` header (not session)

### Auth / Guest Mode
Middleware (`src/middleware.ts`) allows unauthenticated access to:
- `/races`, `/races/*` — race list and detail (read-only)
- `/leaderboard` — global leaderboard only (Friends tab hidden for guests)
- `/profile/*` — public user profiles
- `/api/races`, `/api/users` — public API routes

Auth is required for: `/profile` (own profile editing), `/picks`, POST `/api/picks`, `/api/friends`, `/onboarding/*`

Pages handle `userId = null` gracefully — show sign-in CTA instead of crashing.

---

## Key Pages & Their Data Fetching

### `/races` → `src/app/(main)/races/page.tsx`
- Fetches: `getActiveSeason()`, `getRacesForSeason(season.id)`, `getPickedRaceIds(userId, season.id)` (skipped for guests)
- Shows upcoming races and completed races as `RaceCard` links
- Renders `<OnboardingCarousel />` at top (dismisses via `localStorage`)

### `/races/[raceId]` → `src/app/(main)/races/[raceId]/page.tsx`
- Fetches: `getRaceById`, `getRaceEntrants`, `getPickForRace` (null for guests)
- If completed: ALSO fetches `getRaceResults` → builds `heroResults` (structured) + `displayResults` (flat)
- Active race → renders `<PickHero>` or sign-in CTA for guests
- Completed race → renders `<HeroVisualization>` + `<PicksDisplay>` (or sign-in CTA) + `<RaceResultsCard>`
- **Both `entrants` and `results` must be passed to HeroVisualization and PicksDisplay**

### `/leaderboard` → `src/app/(main)/leaderboard/page.tsx`
- Fetches global leaderboard + user rank from `getGlobalLeaderboard` / `getUserSeasonRank`
- Guests see global leaderboard only (no Friends tab, no FriendSearch)

### `/profile` → `src/app/(main)/profile/page.tsx` (auth-required)
- Shows `TeamPicker` for selecting favourite team (stored as `favoriteTeamSlug` on User)

### `/profile/[userId]` → `src/app/(main)/profile/[userId]/page.tsx` (public, client component)
- SWR-fetches `/api/users/[userId]` — shows picks per race + season total score
- Accessible by guests and linked from leaderboard rows + friend list

---

## Pick Flow (Active Race)

```
races/[raceId]/page.tsx (server)
  └─ PickHero (src/components/picks/PickHero.tsx) [client]
       ├─ PickBubble: circular bubble showing headshot photo when picked, "tap to pick" when empty
       │    → tap opens DriverSheet bottom sheet
       ├─ DriverSheet: scrollable list of all entrants
       │    → each row: team logo (on team-color bg) + driver code/name + number
       │    → selecting a driver closes sheet and updates PickBubble
       ├─ ResultBubble: smaller bubble below each PickBubble showing actual race result
       │    → shows driver headshot photo when result is available
       └─ Save button → POST /api/picks
```

## Results / Completed Race Flow

```
races/[raceId]/page.tsx (server)
  ├─ HeroVisualization (src/components/race/HeroVisualization.tsx) [client]
  │    └─ SlotColumn × 3 (Winner / P10 / DNF)
  │         ├─ DriverBubble (top, larger): actual result driver with headshot
  │         └─ DriverBubble (bottom, smaller): user's pick with headshot
  │    Props needed: race, pick, results (structured), entrants
  └─ PicksDisplay (src/components/picks/PicksDisplay.tsx)
       └─ CategoryRow × 3: shows pick code → actual result → score
       Props needed: pick, race, results (flat ResultRow[]), entrants
```

---

## Driver Photos & Team Logos (Static Assets)

- **Driver photos**: `public/drivers/{lastName}.png` (22 drivers, 2026 grid)
- **Team logos**: `public/teamlogos/{slug}.webp` (11 teams, white logos)
- **Static mapping**: `src/lib/f1/teams.ts`
  - `DRIVER_PHOTOS: Record<number, string>` — driver number → photo path
  - `TEAMS: Record<TeamSlug, TeamInfo>` — team registry with slug, name, color, logoUrl, dbMatch[]
  - `resolveTeam(constructorName)` — matches DB Constructor name to TeamInfo
- **Where photos/logos are injected**: `getRaceEntrants()` in `src/lib/services/race.service.ts` calls `resolveTeam()` and `DRIVER_PHOTOS` to populate `DriverSummary.photoUrl` and `DriverSummary.constructor.{slug, logoUrl, color}`

### Driver photo format
Images in `public/drivers/` are pre-cropped circular headshots — use default `object-center` (no objectPosition override needed). Two DB drivers have no photo (DOO #7 Jack Doohan, TSU #22 Yuki Tsunoda) — fall back to team-color background with initials.

---

## Service Layer (`src/lib/services/`)

| Service | Owns |
|---|---|
| `race.service.ts` | `getRaceById`, `getRaceEntrants`, `getRaceResults`, `getRacesForSeason`, `getActiveSeason`, `getCurrentRace` |
| `pick.service.ts` | `getPickForRace`, `getPickedRaceIds`, `getPicksForSeason`, `createOrUpdatePick` |
| `ingestion.service.ts` | `ingestResultsForRace` — fetches OpenF1 final results → upserts `RaceResult`; `findRacesNeedingIngestion` |
| `scoring.service.ts` | `computeAndStoreScoresForRace` — orchestrates scoring via pure formula (requires results already in DB) |
| `leaderboard.service.ts` | `getGlobalLeaderboard`, `getFriendsLeaderboard`, `getUserSeasonRank` |
| `user.service.ts` | `setUsername`, `isUsernameAvailable`, `setFavoriteTeam`, `suggestUsernames` |
| `friendship.service.ts` | Friend request CRUD |
| `lock.service.ts` | `isRaceLocked(race)`, `isPickSetLocked(pickSet)` |

### Cron Pipeline (race completion flow)
```
sync-schedule  (daily 00:00) → upserts Race/Driver/Constructor/RaceEntry from OpenF1
lock-picks     (daily 12:00) → locks PickSets past cutoff
ingest-results (daily 20:00) → ingestResultsForRace → computeAndStoreScoresForRace
```
`ingest-results` replaces the old `compute-scores` cron. It runs both ingestion and scoring in sequence. The old `/api/cron/compute-scores` route remains for manual targeted reruns.

---

## Type System

Three parallel type systems — keep them separate:
- **Domain types** (`src/types/domain.ts`) — safe for client and server, decoupled from Prisma. `DriverSummary` includes `constructor.{slug, logoUrl, color}`. `LeaderboardRow` includes `teamLogoUrl`, `teamColor`.
- **Prisma types** — DB layer only, never leak to client
- **F1 types** (`src/lib/f1/types.ts`) — provider-agnostic, internal to the F1 layer

### Serialization pattern
`Date` fields cannot cross the RSC/client boundary. All client components receive "Serialized" variants: `SerializedRaceSummary`, `SerializedPickSetData`, `SerializedPickSetWithScore` — same shape but dates as ISO strings.

---

## Key DB Constraints

- `PickSet` unique on `[userId, raceId]` — one pick set per user per race
- `Race` unique on `[seasonId, round, type]` — separates MAIN and SPRINT races
- Two lock levels: `race.lockCutoffUtc` (race-wide) and `pickSet.lockedAt` (individual override)
- `User.favoriteTeamSlug` — team slug e.g. `"mercedes"` for leaderboard icon

---

## Scoring Formula

| | Main Race | Sprint |
|---|---|---|
| 10th place | `max(0, 25 - \|pos-10\| × 3)` | `max(0, 10 - \|pos-10\|)` |
| Winner bonus | +5 | +2 |
| DNF bonus | +3 | +1 |

Only CLASSIFIED drivers contribute to position scoring.

---

## UI Components (`src/components/ui/`)

- `Avatar` — shows OAuth photo, team logo (on team-color bg), or initials gradient. Props: `src`, `name`, `teamLogoUrl`, `teamColor`, `color` (ring), `size`
- `Button` — variants: `primary`, `secondary`, `ghost`. Props: `variant`, `size`, `fullWidth`, `loading`
- `Badge` — variants: `accent`, `warning`, `success`
- `SegmentedControl` — tab-style selector
- `Card` — surface card wrapper

---

## Environment Variables

```
DATABASE_URL           # PostgreSQL connection string
AUTH_SECRET            # NextAuth secret
GOOGLE_CLIENT_ID       # OAuth (required)
GOOGLE_CLIENT_SECRET
APPLE_ID               # OAuth (optional)
APPLE_SECRET
CRON_SECRET            # Bearer token for /api/cron/* routes
OPENF1_BASE_URL        # Defaults to https://api.openf1.org/v1
```
