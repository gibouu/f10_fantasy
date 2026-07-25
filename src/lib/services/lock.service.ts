/**
 * Pick locking service.
 *
 * Lock semantics:
 *   - A race is "locked" when the current server time >= race.lockCutoffUtc.
 *   - A specific PickSet is "locked" when its lockedAt field has been set.
 *   - A pick set can only be edited when BOTH the race is unlocked AND the
 *     individual pick set has not been explicitly locked.
 */

import { db } from '@/lib/db/client'
import type { Race } from '@prisma/client'

// ─────────────────────────────────────────────
// Pure helpers (no DB)
// ─────────────────────────────────────────────

/**
 * Returns true if the race's lock cutoff has passed (i.e. new picks are
 * no longer accepted and existing picks cannot be edited).
 */
export function isRaceLocked(race: Pick<Race, 'lockCutoffUtc'>): boolean {
  return new Date() >= race.lockCutoffUtc
}

/**
 * Returns true if a specific pick set has been explicitly locked
 * (lockedAt timestamp was set by the lock job).
 */
export function isPickSetLocked(lockedAt: Date | null): boolean {
  return lockedAt !== null
}

// ─────────────────────────────────────────────
// DB operations
// ─────────────────────────────────────────────

/**
 * Lock all unlocked pick sets for a given race by setting lockedAt = now AND
 * snapshotting the live driver/seat fields into the locked* columns. The
 * column-to-column copy and the lockedAt write happen in a single SQL
 * statement so the snapshot is always consistent with the lock timestamp.
 *
 * Also captures the **early-bird** snapshot: `lockedSubmittedBeforeQualifying`
 * is true iff the user's last edit (`PickSet.updatedAt`) is strictly before
 * `Race.qualifyingStartUtc`. The comparison uses the OLD `updatedAt` (before
 * this UPDATE's `@updatedAt` writes the new value), so it reflects the user's
 * last edit rather than the lock cron's own write.
 *
 * Idempotent — already-locked sets are skipped by the WHERE clause.
 *
 * Returns the count of pick sets that were locked in this invocation.
 */
export async function lockPicksForRace(raceId: string): Promise<number> {
  const now = new Date()

  // UPDATE ... FROM joins Race so we can read qualifyingStartUtc per row.
  // Postgres evaluates SET expressions against the OLD row state, so
  // "PickSet"."updatedAt" inside the SET reads the value BEFORE this
  // statement bumps it — exactly what we want for the early-bird check.
  // qualifyingStartUtc IS NULL → flag = false (no bonus).
  const count = await db.$executeRaw`
    UPDATE "PickSet" AS p
    SET "lockedAt"                       = ${now},
        "lockedTenthPlaceDriverId"       = p."tenthPlaceDriverId",
        "lockedTenthPlaceSeatKey"        = p."tenthPlaceSeatKey",
        "lockedWinnerDriverId"           = p."winnerDriverId",
        "lockedWinnerSeatKey"            = p."winnerSeatKey",
        "lockedDnfDriverId"              = p."dnfDriverId",
        "lockedDnfSeatKey"               = p."dnfSeatKey",
        "lockedSubmittedBeforeQualifying" = (
          r."qualifyingStartUtc" IS NOT NULL
          AND p."updatedAt" < r."qualifyingStartUtc"
        )
    FROM "Race" AS r
    WHERE p."raceId"   = ${raceId}
      AND r."id"       = p."raceId"
      AND p."lockedAt" IS NULL
  `

  return Number(count)
}
