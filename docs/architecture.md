# F10 Racing — Architecture Document

## Tech Stack

| Layer          | Choice                        | Reason                                                                 |
|----------------|-------------------------------|------------------------------------------------------------------------|
| Framework      | Next.js 14 (App Router)       | SSR, RSC, API routes all in one monolith; Vercel-native               |
| Language       | TypeScript (strict)           | Type safety across domain, services, and UI                           |
| Styling        | Tailwind CSS + CVA            | Utility-first with component variant management                        |
| Database       | PostgreSQL                    | Relational integrity for pick uniqueness, scores, friendships          |
| ORM            | Prisma                        | Type-safe queries, migration tooling, good DX                          |
| Auth           | Auth.js v5 (NextAuth)         | Google OAuth + Apple-ready; session management via JWT or DB           |
| API style      | Route handlers (Next.js)      | Co-located with app; no separate API service needed for MVP            |
| Background     | Vercel Cron (or pg-boss)      | Race schedule sync, result ingestion triggers                          |
| Deployment     | Vercel                        | Zero-config Next.js deployment; preview environments                   |
| F1 Data        | Jolpica API (Ergast-compatible)| Free, well-documented, historical + current season data               |

---

## Database Schema

### Design Principles
- `UNIQUE(userId, raceId)` on `PickSet` enforces one-pick-set-per-user-per-race at DB level
- All timestamps in UTC
- Scores are derived but stored for performance and auditability
- Soft deletions not used; hard constraints preferred

### Entity Relationship Summary

```
User ──< PickSet >── Race
User ──< FriendRequest >── User
Race >── Season
Race ──< RaceResult >── Driver
Driver >── Constructor
PickSet ──< ScoreBreakdown
Race ──< RaceEntry (drivers entered for this race)
```

### Schema (Prisma-style)

```prisma
model User {
  id              String    @id @default(cuid())
  email           String    @unique
  publicUsername  String    @unique
  displayName     String
  avatarUrl       String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  accounts        Account[]
  sessions        Session[]
  pickSets        PickSet[]
  sentRequests    FriendRequest[] @relation("Requester")
  receivedRequests FriendRequest[] @relation("Addressee")
}

model Account {
  // NextAuth standard Account model
}

model Session {
  // NextAuth standard Session model
}

model Season {
  id        String  @id @default(cuid())
  year      Int     @unique
  isActive  Boolean @default(false)
  races     Race[]
}

model Race {
  id                 String     @id @default(cuid())
  seasonId           String
  round              Int
  name               String
  circuitName        String
  country            String
  scheduledStartUtc  DateTime
  lockCutoffUtc      DateTime   // configurable per race
  status             RaceStatus @default(UPCOMING)
  externalId         String?    @unique  // provider's race ID
  createdAt          DateTime   @default(now())
  updatedAt          DateTime   @updatedAt

  season             Season     @relation(fields: [seasonId], references: [id])
  entries            RaceEntry[]
  results            RaceResult[]
  pickSets           PickSet[]

  @@unique([seasonId, round])
}

enum RaceStatus {
  UPCOMING
  LIVE
  COMPLETED
  CANCELLED
}

model Driver {
  id           String  @id @default(cuid())
  code         String  // TRI-code e.g. "VER", "HAM"
  firstName    String
  lastName     String
  number       Int
  photoUrl     String?
  constructorId String
  externalId   String? @unique

  constructor  Constructor @relation(fields: [constructorId], references: [id])
  entries      RaceEntry[]
  results      RaceResult[]
  tenthPicks   PickSet[]   @relation("TenthPick")
  winnerPicks  PickSet[]   @relation("WinnerPick")
  dnfPicks     PickSet[]   @relation("DnfPick")
}

model Constructor {
  id        String  @id @default(cuid())
  name      String
  shortName String
  color     String  // hex color for UI accents
  externalId String? @unique
  drivers   Driver[]
}

model RaceEntry {
  id        String  @id @default(cuid())
  raceId    String
  driverId  String
  isEligible Boolean @default(true) // false if DNS confirmed pre-race

  race      Race    @relation(fields: [raceId], references: [id])
  driver    Driver  @relation(fields: [driverId], references: [id])

  @@unique([raceId, driverId])
}

model RaceResult {
  id           String       @id @default(cuid())
  raceId       String
  driverId     String
  position     Int?         // null if no classified position
  status       ResultStatus
  fastestLap   Boolean      @default(false)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  race         Race         @relation(fields: [raceId], references: [id])
  driver       Driver       @relation(fields: [driverId], references: [id])

  @@unique([raceId, driverId])
}

enum ResultStatus {
  CLASSIFIED   // finished with a position
  DNF          // did not finish (retired, mechanical, accident)
  DNS          // did not start
  DSQ          // disqualified post-race
}

model PickSet {
  id                String    @id @default(cuid())
  userId            String
  raceId            String
  tenthPlaceDriverId String
  winnerDriverId    String
  dnfDriverId       String
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  lockedAt          DateTime?

  user              User      @relation(fields: [userId], references: [id])
  race              Race      @relation(fields: [raceId], references: [id])
  tenthPlaceDriver  Driver    @relation("TenthPick", fields: [tenthPlaceDriverId], references: [id])
  winnerDriver      Driver    @relation("WinnerPick", fields: [winnerDriverId], references: [id])
  dnfDriver         Driver    @relation("DnfPick", fields: [dnfDriverId], references: [id])
  scoreBreakdown    ScoreBreakdown?

  @@unique([userId, raceId])  // ONE PICK SET PER USER PER RACE
}

model ScoreBreakdown {
  id              String   @id @default(cuid())
  pickSetId       String   @unique
  tenthPlaceScore Int      // 0–25
  winnerBonus     Int      // 0 or 5
  dnfBonus        Int      // 0 or 3
  totalScore      Int      // sum of above
  computedAt      DateTime @default(now())

  pickSet         PickSet  @relation(fields: [pickSetId], references: [id])
}

model FriendRequest {
  id          String              @id @default(cuid())
  requesterId String
  addresseeId String
  status      FriendRequestStatus @default(PENDING)
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  requester   User                @relation("Requester", fields: [requesterId], references: [id])
  addressee   User                @relation("Addressee", fields: [addresseeId], references: [id])

  @@unique([requesterId, addresseeId])
}

enum FriendRequestStatus {
  PENDING
  ACCEPTED
  REJECTED
}
```

---

## Backend / Service Architecture

All services live in `src/lib/services/`. They are plain TypeScript modules (not classes), exported as functions. They operate on the Prisma client and do not touch HTTP layer.

```
src/lib/
├── db/
│   └── client.ts              # Singleton Prisma client
├── auth/
│   └── config.ts              # Auth.js config (providers, callbacks)
├── f1/
│   ├── types.ts               # Internal normalized F1 data types
│   ├── adapter.ts             # Provider interface (F1ProviderAdapter)
│   ├── normalizer.ts          # Maps provider response → internal types
│   └── providers/
│       └── jolpica.ts         # Jolpica/Ergast concrete implementation
├── services/
│   ├── user.service.ts        # User creation, username gen, profile
│   ├── race.service.ts        # Race schedule, current race, status
│   ├── pick.service.ts        # Create/update picks, validation
│   ├── lock.service.ts        # Lock enforcement, cutoff calculation
│   ├── result.service.ts      # Ingest normalized results into DB
│   ├── scoring.service.ts     # Trigger and store score computation
│   ├── leaderboard.service.ts # Aggregate season/last-race rankings
│   └── friendship.service.ts  # Friend requests, acceptance, search
└── scoring/
    └── formula.ts             # Pure functions: no DB, no I/O
```

### Key Service Contracts

**pick.service.ts**
```ts
createOrUpdatePick(userId, raceId, picks): Promise<PickSet>
  // Validates: race exists, drivers eligible, no duplicate driver in two slots
  // Calls lock.service to check if still editable
  // Upserts via (userId, raceId) unique constraint

getPickForRace(userId, raceId): Promise<PickSet | null>
```

**lock.service.ts**
```ts
isPickLocked(race: Race): boolean
  // Returns true if now() >= race.lockCutoffUtc
  // Server-side only — never trust client clock

lockPickSet(pickSetId): Promise<PickSet>
  // Sets lockedAt, marks as immutable
  // Called by cron job at lock cutoff
```

**scoring/formula.ts** (pure, no side effects)
```ts
computeTenthPlaceScore(predictedDriverId, results): number
computeWinnerBonus(predictedDriverId, results): number
computeDnfBonus(predictedDriverId, results): number
computeRaceScore(pickSet, results): ScoreBreakdownInput
```

**scoring.service.ts**
```ts
computeAndStoreScoresForRace(raceId): Promise<void>
  // Loads all pick sets for race
  // Loads normalized results
  // Calls formula.ts for each pick set
  // Upserts ScoreBreakdown records
  // Idempotent — safe to call multiple times
```

**leaderboard.service.ts**
```ts
getGlobalLeaderboard(seasonId, sort: 'season' | 'lastRace'): Promise<LeaderboardRow[]>
getFriendsLeaderboard(userId, seasonId, sort): Promise<LeaderboardRow[]>
getUserRank(userId, seasonId): Promise<number>
```

---

## Frontend / Component Architecture

```
src/
├── app/
│   ├── layout.tsx             # Root layout, font, global CSS
│   ├── (auth)/
│   │   └── signin/page.tsx    # Sign-in page
│   └── (main)/
│       ├── layout.tsx         # Tab bar, header shell
│       ├── leaderboard/
│       │   └── page.tsx       # Leaderboard tab (RSC)
│       └── picks/
│           └── page.tsx       # My Picks tab (RSC)
├── components/
│   ├── ui/                    # Primitive components (Button, Card, Toggle, Badge, Avatar)
│   ├── race/
│   │   ├── HeroVisualization.tsx   # Signature bubble cluster component
│   │   ├── RaceSelector.tsx
│   │   └── LiveRaceOrder.tsx
│   ├── picks/
│   │   ├── PickForm.tsx            # Driver selection form
│   │   ├── PicksDisplay.tsx        # Post-race picks + results view
│   │   ├── ScoreBreakdown.tsx      # Points breakdown card
│   │   └── LockCountdown.tsx
│   └── leaderboard/
│       ├── LeaderboardList.tsx
│       ├── LeaderboardRow.tsx
│       └── FriendSearch.tsx
└── hooks/
    ├── useCurrentRace.ts
    ├── usePickSet.ts
    └── useLiveRace.ts
```

### Data Fetching Pattern
- **Server Components** (RSC) for all initial data loads (leaderboard, race info, existing picks)
- **Client Components** only for interactive UI (pick selection, live updates, friend search)
- **Route Handlers** (`src/app/api/`) for mutations and client-side fetches
- No third-party data-fetching library needed for MVP; use native `fetch` with `cache: 'no-store'` for dynamic data

---

## External API Abstraction

### Provider Interface

```ts
// src/lib/f1/adapter.ts
export interface F1ProviderAdapter {
  getSeason(year: number): Promise<NormalizedSeason>
  getRaceSchedule(year: number): Promise<NormalizedRace[]>
  getRaceEntrants(year: number, round: number): Promise<NormalizedDriver[]>
  getLiveResults(year: number, round: number): Promise<NormalizedLiveClassification | null>
  getFinalResults(year: number, round: number): Promise<NormalizedFinalResult[]>
}
```

### Internal Normalized Types

```ts
// src/lib/f1/types.ts

type NormalizedSeason = { year: number; totalRounds: number }

type NormalizedRace = {
  externalId: string
  round: number
  name: string
  circuitName: string
  country: string
  scheduledStartUtc: Date
}

type NormalizedDriver = {
  externalId: string
  code: string         // "VER"
  firstName: string
  lastName: string
  number: number
  constructorId: string
}

type NormalizedLiveClassification = {
  raceId: string
  timestamp: Date
  entries: Array<{
    driverId: string
    position: number
    status: 'RACING' | 'DNF' | 'PIT' | 'SAFETY_CAR' | 'OUT'
    lap: number
  }>
}

type NormalizedFinalResult = {
  driverId: string
  position: number | null
  status: 'CLASSIFIED' | 'DNF' | 'DNS' | 'DSQ'
  fastestLap: boolean
}
```

### Concrete Provider: Jolpica

Jolpica mirrors Ergast API structure. It supports:
- Race schedules: `GET /f1/{year}.json`
- Race results: `GET /f1/{year}/{round}/results.json`
- Driver standings, constructor data

The `jolpica.ts` implementation maps raw Jolpica responses to internal normalized types. If Jolpica is ever replaced (official F1 API, OpenF1, etc.), only this file changes.

### Ingestion Strategy

```
Cron: daily          → syncRaceSchedule(currentYear)
Cron: every 5min     → syncLiveResults(currentRaceId)   [only when race is LIVE]
Webhook/Cron: post   → syncFinalResults(raceId) → computeAndStoreScoresForRace(raceId)
```

---

## Cron / Background Jobs

| Job                     | Trigger         | Action                                          |
|-------------------------|-----------------|-------------------------------------------------|
| syncRaceSchedule        | Daily at 00:00  | Fetch + upsert upcoming race schedule           |
| lockPicksForRace        | Per-race cutoff | Lock all pick sets for race, set lockedAt       |
| syncLiveResults         | Every 2–5 min   | Fetch live classification, store snapshot        |
| syncFinalResults        | Post-race       | Fetch official results, ingest, trigger scoring |
| computeScores           | Post-ingestion  | Run scoring engine for all picks in a race      |

For MVP: Vercel Cron handles these as route-handler endpoints with a secret header for authorization.

---

## Security Considerations

- All mutations validated server-side (pick content, lock status, ownership)
- Lock cutoff is never client-trusted
- `userId` always derived from session, never from request body
- Friend request cannot be sent to self
- Rate limiting on pick submission (simple per-user)
- Cron endpoints protected by `CRON_SECRET` header
