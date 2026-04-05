# F10 Racing — Project Log

## 2026-04-04 — Phase 2 Scaffold Complete

### What Was Done

Full project scaffold generated. Every major layer now has working TypeScript files.

#### Infrastructure
- `package.json` — replaced Supabase deps with `next-auth@^5.0.0-beta.25`, `@auth/prisma-adapter@^2.7`, `@prisma/client@^5`, removed all legacy deps
- `prisma/schema.prisma` — full schema with 13 models, 5 enums, all relations, `UNIQUE(userId, raceId)` on PickSet
- `.env.example` — all required vars documented with setup notes
- `next.config.mjs` — image domains, Auth.js v5 compat
- `tsconfig.json` — updated to `moduleResolution: bundler` for App Router
- `vercel.json` — cron job schedule (sync-schedule daily, lock-picks every min, compute-scores every 15min)

#### Auth
- `src/auth.ts` — Auth.js v5 config with Google + Apple providers, PrismaAdapter, JWT session strategy
  - Session contains `id`, `publicUsername`, `usernameSet`
  - `trigger: "update"` support for post-onboarding session refresh
- `src/middleware.ts` — Route protection: unauthenticated → /signin, usernameSet=false → /onboarding/username
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js handler re-export

#### Domain Layer
- `src/types/domain.ts` — all domain types decoupled from Prisma (safe for client imports)
- `src/lib/f1/types.ts` — internal normalized F1 types (provider-agnostic)
- `src/lib/f1/adapter.ts` — `F1ProviderAdapter` interface + `createF1Provider()` factory
- `src/lib/f1/providers/openf1.ts` — OpenF1 concrete implementation (meetings, sessions, drivers, position, race control)
- `src/lib/scoring/formula.ts` — pure scoring functions, main and sprint variants, `MAX_MAIN_RACE_SCORE = 33`, `MAX_SPRINT_SCORE = 13`

#### Services
- `src/lib/services/lock.service.ts` — pick lock enforcement (server-side cutoff check, bulk lock)
- `src/lib/services/pick.service.ts` — create/update picks with Zod validation, lock guard, entrant validation
- `src/lib/services/scoring.service.ts` — idempotent score computation orchestration
- `src/lib/services/leaderboard.service.ts` — global/friends/rank with tie-break ordering
- `src/lib/services/friendship.service.ts` — search, request, accept, reject
- `src/lib/services/user.service.ts` — custom username validation, availability check, suggestions
- `src/lib/services/race.service.ts` — schedule queries, current race, entrants
- `src/lib/db/client.ts` — Prisma singleton

#### Design System
- `tailwind.config.ts` — custom color tokens, Inter font, animation keyframes
- `src/app/globals.css` — CSS variables (dark-first), `.glass` class, scrollbar, selection color

#### App Shell
- `src/app/layout.tsx` — root layout, Inter font, metadata, max-w-[430px] centering
- `src/app/(main)/layout.tsx` — sticky header, fixed tab bar, UserAvatarMenu, TabBarLink
- `src/app/(auth)/signin/page.tsx` — Google + Apple sign-in, framer-motion entry
- `src/app/(auth)/onboarding/username/page.tsx` — custom username selection with live availability check, suggestions

#### Pages
- `src/app/(main)/picks/page.tsx` — My Picks (server component)
- `src/app/(main)/leaderboard/page.tsx` — Leaderboard (server component)

#### API Routes
- `src/app/api/picks/route.ts` — GET/POST picks
- `src/app/api/leaderboard/route.ts` — GET leaderboard
- `src/app/api/friends/route.ts` — GET/POST friends
- `src/app/api/friends/[id]/route.ts` — PATCH accept/reject
- `src/app/api/races/route.ts` — GET race schedule
- `src/app/api/races/[id]/route.ts` — GET single race details
- `src/app/api/users/username/route.ts` — POST set username, GET check availability
- `src/app/api/users/suggest-usernames/route.ts` — GET suggestions
- `src/app/api/cron/sync-schedule/route.ts` — sync race schedule from OpenF1
- `src/app/api/cron/lock-picks/route.ts` — lock picks for races past cutoff
- `src/app/api/cron/compute-scores/route.ts` — trigger score computation

#### Components
- `src/components/ui/button.tsx` — CVA button, variants, loading state
- `src/components/ui/card.tsx` — Card, CardHeader, CardContent, CardFooter
- `src/components/ui/badge.tsx` — Badge with team color support
- `src/components/ui/avatar.tsx` — Avatar with initials fallback, team ring
- `src/components/ui/segmented-control.tsx` — framer-motion slide toggle
- `src/components/race/HeroVisualization.tsx` — signature bubble cluster component
- `src/components/race/LockCountdown.tsx` — live countdown client component
- `src/components/picks/PickForm.tsx` — three-slot driver selection form
- `src/components/picks/PicksDisplay.tsx` — post-race picks vs results
- `src/components/picks/ScoreBreakdown.tsx` — score breakdown card
- `src/components/leaderboard/LeaderboardList.tsx` — ranked list with scope/sort toggles
- `src/components/leaderboard/FriendSearch.tsx` — friend search + request management
- `src/lib/utils.ts` — cn(), formatLockTime, msToCountdown, pluralize

### Key Architecture Decisions Made in Phase 2

**Sprint races**: Added `RaceType` enum (MAIN|SPRINT) to Race model. `@@unique([seasonId, round, type])` allows sprint + main to coexist per round. Scoring formula branches on raceType at runtime.

**Custom usernames**: `publicUsername` is nullable on User until onboarding. `usernameSet: Boolean` flag drives middleware redirect. Onboarding page has live availability check (debounced 400ms) and username suggestions.

**OpenF1 as provider**: `OpenF1Provider` implements `F1ProviderAdapter`. Final results derived from last position snapshot + race control messages for DNF detection (with TODO for refinement). Provider swappable by replacing one file.

**Lock cron**: `vercel.json` runs `/api/cron/lock-picks` every minute. Route finds all races past `lockCutoffUtc` and locks their pick sets via `lockPicksForRace()`. This means lock is always within 60s of cutoff.

**Idempotent scoring**: `computeAndStoreScoresForRace(raceId)` is safe to call repeatedly. Uses upsert. `computeAndStoreScoresForRace` runs after result ingestion and also on a 15-minute cron.

### Pending Issues
- Apple sign-in requires Apple Developer account setup (documented in .env.example)
- OpenF1 DNF detection is simplified — TODO in provider for cross-referencing race control messages
- No seed data / admin panel for creating seasons/races manually (needed before first sync)
- Live race polling not yet wired (OpenF1 position endpoint available, needs client-side polling in LockCountdown/HeroVisualization)

### Next Recommended Step

**Phase 3 — Wire everything together and run it locally**

1. `npm install` — install new dependencies
2. Set up `.env.local` from `.env.example`
3. `npm run db:push` — push Prisma schema to database
4. Seed one season + upcoming race manually (or build a seed script)
5. Test auth flow end-to-end (Google first, Apple after account setup)
6. Test pick creation → lock → score computation pipeline
7. Fix any TypeScript errors surfaced during compile
