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

/**
 * Returns the number of milliseconds until the race's lock cutoff.
 * Negative values mean the cutoff has already passed.
 */
export function msUntilLock(race: Pick<Race, 'lockCutoffUtc'>): number {
  return race.lockCutoffUtc.getTime() - Date.now()
}

// ─────────────────────────────────────────────
// DB operations
// ─────────────────────────────────────────────

/**
 * Lock all unlocked pick sets for a given race by setting lockedAt = now.
 *
 * This is called by a scheduled job (or a webhook) once the race's lock
 * cutoff time has been reached. Idempotent — already-locked sets are skipped
 * by the WHERE clause.
 *
 * Returns the count of pick sets that were locked in this invocation.
 */
export async function lockPicksForRace(raceId: string): Promise<number> {
  const now = new Date()

  const result = await db.pickSet.updateMany({
    where: {
      raceId,
      lockedAt: null, // only lock sets that haven't been locked yet
    },
    data: {
      lockedAt: now,
    },
  })

  return result.count
}

/**
 * Returns true if the user can still create or edit a pick for the given race.
 *
 * Checks two conditions:
 *   1. The race's lockCutoffUtc has not passed.
 *   2. If the user already has a pick set, it must not have lockedAt set.
 */
export async function canEditPicks(
  userId: string,
  raceId: string,
): Promise<boolean> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: { lockCutoffUtc: true },
  })

  if (!race) return false

  // Race-level lock — applies to all users regardless of their pick set state
  if (isRaceLocked(race)) return false

  // Check if the user's specific pick set has been locked
  const existingPick = await db.pickSet.findUnique({
    where: {
      userId_raceId: { userId, raceId },
    },
    select: { lockedAt: true },
  })

  // No existing pick → user can still create one
  if (!existingPick) return true

  // Pick exists — return false if it was explicitly locked
  return !isPickSetLocked(existingPick.lockedAt)
}
