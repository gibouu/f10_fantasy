# Decisions

## Purpose
Record durable technical decisions so future work stays consistent.
Add entries only for decisions that are likely to matter again.
Do not log temporary debugging notes here.

## Entry Format
### YYYY-MM-DD — Decision Title
- Status: proposed / accepted / deprecated / replaced
- Context:
- Decision:
- Reason:
- Tradeoffs:
- Affected areas:
- Follow-up:

---

## Entries

### 2026-04-15 — Three parallel type systems
- Status: accepted
- Context: Next.js App Router crosses server/client boundary; Prisma types must not leak to client.
- Decision: Maintain three separate type layers — Domain types (`src/types/domain.ts`), Prisma types (DB-only), F1 types (`src/lib/f1/types.ts`).
- Reason: Type safety across the RSC boundary; prevents accidental serialization of Prisma objects.
- Tradeoffs: More types to maintain; mapping boilerplate between layers.
- Affected areas: Any new data shape introduced — must decide which layer it lives in.
- Follow-up: Use `Serialized*` variants for Date fields crossing the boundary.

### 2026-04-15 — Cron jobs via AWS Lambda, not Vercel Crons
- Status: accepted
- Context: Need scheduled jobs (sync-schedule, ingest-results, etc.). Vercel Crons were an option.
- Decision: All cron jobs are AWS Lambda functions that POST to `/api/cron/*` routes with `Authorization: Bearer CRON_SECRET`.
- Reason: More control over scheduling, retries, and execution environment. No cron config lives in the repo.
- Tradeoffs: External dependency on AWS; schedules not visible in the repo.
- Affected areas: All `/api/cron/*` routes. Any new cron requires an AWS Lambda trigger to be configured externally.
- Follow-up: Document the AWS Lambda config somewhere accessible.

### 2026-04-15 — No DB migrations, use db:push
- Status: accepted
- Context: Early-stage project; schema evolves frequently.
- Decision: Use `prisma db push` (direct push) instead of migration files.
- Reason: Faster iteration; no migration history overhead for a small team.
- Tradeoffs: No migration history; risky for production data changes. Must be deliberate about destructive schema changes.
- Affected areas: All schema changes; deployment workflow.
- Follow-up: Consider switching to migrations when schema stabilizes.

### 2026-04-15 — Guest access for read-only routes
- Status: accepted
- Context: Many pages are useful without auth (race results, leaderboard, profiles).
- Decision: Middleware allows unauthenticated access to `/races`, `/leaderboard`, `/profile/*`, and public API routes. Auth is required only for picking and social features.
- Reason: Better SEO and shareability; lower barrier to entry.
- Tradeoffs: Pages must defensively handle `userId = null`.
- Affected areas: `src/middleware.ts`, all read-only pages.
- Follow-up: —

### 2026-04-15 — Scoring formula: P10 picks cut off at 9 positions away
- Status: accepted
- Context: P10 scoring used F1 points table initially, then was revised.
- Decision: `max(0, 25 - |pos-10| × 3)` for main race. Points go to zero at 9 positions away (P1 scores 0). Sprint uses `max(0, 10 - |pos-10|)`.
- Reason: Creates meaningful scoring gradient without rewarding completely wrong picks.
- Tradeoffs: P1 finishing scores 0 for a P10 pick — intentional.
- Affected areas: `src/lib/scoring/formula.ts`.
- Follow-up: —

### 2026-04-15 — resolveTeam() injection at service layer, not component level
- Status: accepted
- Context: Driver photos and team logos need to be available in UI components.
- Decision: `getRaceEntrants()` in `race.service.ts` calls `resolveTeam()` and `DRIVER_PHOTOS` to populate `DriverSummary.photoUrl` and `constructor.{slug, logoUrl, color}`. Components receive the enriched domain type.
- Reason: Single source of truth; components stay presentational.
- Tradeoffs: Service layer has knowledge of static asset mapping.
- Affected areas: `race.service.ts`, `src/lib/f1/teams.ts`, `src/types/domain.ts`.
- Follow-up: —
