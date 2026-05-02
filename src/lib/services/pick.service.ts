/**
 * Pick creation and retrieval service.
 *
 * Enforces:
 *   - Race must exist and not be locked before creating/updating picks
 *   - All three picked drivers must be different
 *   - All three picked drivers must be registered race entrants
 *   - Existing pick sets that have been explicitly locked cannot be mutated
 *   - One pick set per user per race (DB unique constraint as backstop)
 */

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db/client'
import { isRaceLocked, isPickSetLocked } from './lock.service'
import { z } from 'zod'
import type { PickSetData, PickSetWithScore, RaceSummary } from '@/types/domain'
import { RaceStatus, RaceType } from '@/types/domain'
import { buildSeatLookup, inferSeatKeyFromDriver } from '@/lib/f1/seats'
import { resolveTeam } from '@/lib/f1/teams'

/**
 * Thrown when a pick cannot be created/updated because either the race-level
 * lock cutoff has passed or the pick set has been individually locked.
 *
 * The /api/picks route maps any error whose message contains "locked" to
 * HTTP 423 — keep the message verbiage consistent.
 */
export class PickLockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PickLockedError'
  }
}

// ─────────────────────────────────────────────
// Validation schema
// ─────────────────────────────────────────────

export const CreatePickSchema = z
  .object({
    raceId: z.string().min(1),
    tenthPlaceDriverId: z.string().min(1),
    winnerDriverId: z.string().min(1),
    dnfDriverId: z.string().min(1),
  })
  .refine(
    (data) => {
      const ids = [
        data.tenthPlaceDriverId,
        data.winnerDriverId,
        data.dnfDriverId,
      ]
      return new Set(ids).size === 3
    },
    { message: 'Each pick must be a different driver' },
  )

export type CreatePickInput = z.infer<typeof CreatePickSchema>

// ─────────────────────────────────────────────
// Internal mappers
// ─────────────────────────────────────────────

function mapPickSetToData(
  ps: {
    id: string
    userId: string
    raceId: string
    tenthPlaceDriverId: string
    tenthPlaceSeatKey: string | null
    winnerDriverId: string
    winnerSeatKey: string | null
    dnfDriverId: string
    dnfSeatKey: string | null
    createdAt: Date
    updatedAt: Date
    lockedAt: Date | null
  },
): PickSetData {
  return {
    id: ps.id,
    userId: ps.userId,
    raceId: ps.raceId,
    tenthPlaceDriverId: ps.tenthPlaceDriverId,
    tenthPlaceSeatKey: ps.tenthPlaceSeatKey,
    winnerDriverId: ps.winnerDriverId,
    winnerSeatKey: ps.winnerSeatKey,
    dnfDriverId: ps.dnfDriverId,
    dnfSeatKey: ps.dnfSeatKey,
    createdAt: ps.createdAt,
    updatedAt: ps.updatedAt,
    lockedAt: ps.lockedAt,
  }
}

function mapRaceToSummary(race: {
  id: string
  seasonId: string
  round: number
  name: string
  circuitName: string
  country: string
  type: string
  scheduledStartUtc: Date
  lockCutoffUtc: Date
  status: string
}): RaceSummary {
  return {
    id: race.id,
    seasonId: race.seasonId,
    round: race.round,
    name: race.name,
    circuitName: race.circuitName,
    country: race.country,
    type: race.type as RaceType,
    scheduledStartUtc: race.scheduledStartUtc,
    lockCutoffUtc: race.lockCutoffUtc,
    status: race.status as RaceStatus,
  }
}

function toSeatAwareDriver(driver: {
  id: string
  code: string
  number: number
  constructor: {
    id: string
    name: string
    shortName: string
  }
}) {
  const team =
    resolveTeam(`${driver.constructor.name} ${driver.constructor.shortName}`) ??
    resolveTeam(driver.constructor.name) ??
    resolveTeam(driver.constructor.shortName)

  return {
    id: driver.id,
    code: driver.code,
    number: driver.number,
    teamId: driver.constructor.id,
    teamSlug: team?.slug ?? null,
  }
}

function resolveStoredSeatKey(
  storedSeatKey: string | null,
  driver: {
    id: string
    code: string
    number: number
    constructor: {
      id: string
      name: string
      shortName: string
    }
  },
): string | null {
  if (storedSeatKey) return storedSeatKey
  return inferSeatKeyFromDriver(toSeatAwareDriver(driver))
}

// ─────────────────────────────────────────────
// Service functions
// ─────────────────────────────────────────────

/**
 * Create or update (upsert) a user's pick set for a race.
 *
 * Guard order:
 *   1. Validate input shape with Zod (throws ZodError on failure)
 *   2. Race must exist
 *   3. Race must not be locked (lockCutoffUtc)
 *   4. All three drivers must be registered as race entrants
 *   5. Existing pick set must not have lockedAt set
 */
export async function createOrUpdatePick(
  userId: string,
  input: CreatePickInput,
): Promise<PickSetData> {
  // 1. Validate input
  const validated = CreatePickSchema.parse(input)

  return db.$transaction(async (tx) => {
    // 2. Load race
    const race = await tx.race.findUnique({
      where: { id: validated.raceId },
      select: { id: true, lockCutoffUtc: true, status: true },
    })

    if (!race) {
      throw new Error(`Race not found: ${validated.raceId}`)
    }

    // 3. Race-level lock check (best-effort — DB guard below is authoritative)
    if (isRaceLocked(race)) {
      throw new PickLockedError(
        `Race ${validated.raceId} is locked — picks can no longer be submitted`,
      )
    }

    // 4. Validate that all picked drivers are registered entrants for this race
    const pickedIds = [
      validated.tenthPlaceDriverId,
      validated.winnerDriverId,
      validated.dnfDriverId,
    ]

    const entries = await tx.raceEntry.findMany({
      where: { raceId: validated.raceId },
      include: { driver: { include: { constructor: true } } },
    })

    const seatAwareEntrants = entries.map((entry) => toSeatAwareDriver(entry.driver))
    const entrantIds = new Set(seatAwareEntrants.map((driver) => driver.id))
    const invalidPicks = pickedIds.filter((id) => !entrantIds.has(id))

    if (invalidPicks.length > 0) {
      throw new Error(
        `The following driver IDs are not registered entrants for this race: ${invalidPicks.join(', ')}`,
      )
    }

    const seatLookup = buildSeatLookup(seatAwareEntrants)

    const data = {
      tenthPlaceDriverId: validated.tenthPlaceDriverId,
      tenthPlaceSeatKey:
        seatLookup.driverIdToSeatKey.get(validated.tenthPlaceDriverId) ?? null,
      winnerDriverId: validated.winnerDriverId,
      winnerSeatKey:
        seatLookup.driverIdToSeatKey.get(validated.winnerDriverId) ?? null,
      dnfDriverId: validated.dnfDriverId,
      dnfSeatKey:
        seatLookup.driverIdToSeatKey.get(validated.dnfDriverId) ?? null,
    }

    // 5. Atomic guarded update — re-asserts both invariants at the DB level.
    // Two concurrent submits at lockCutoff − Δ both pass the JS check above,
    // but only the request whose write commits while lockCutoffUtc > now()
    // and lockedAt IS NULL succeeds.
    const updated = await tx.pickSet.updateMany({
      where: {
        userId,
        raceId: validated.raceId,
        lockedAt: null,
        race: { lockCutoffUtc: { gt: new Date() } },
      },
      data,
    })

    if (updated.count === 0) {
      // Either no row exists yet, or row exists but failed the guard (locked).
      const existing = await tx.pickSet.findUnique({
        where: { userId_raceId: { userId, raceId: validated.raceId } },
        select: { lockedAt: true },
      })

      if (existing) {
        if (isPickSetLocked(existing.lockedAt)) {
          throw new PickLockedError(
            'This pick set has been locked and can no longer be edited',
          )
        }
        // Row exists but the relation guard didn't match — race must be locked.
        throw new PickLockedError(
          `Race ${validated.raceId} is locked — picks can no longer be submitted`,
        )
      }

      // No existing row — create one. Re-check race lock first inside the tx
      // so we don't insert a fresh pick after the cutoff.
      const fresh = await tx.race.findUnique({
        where: { id: validated.raceId },
        select: { lockCutoffUtc: true },
      })
      if (!fresh || isRaceLocked(fresh)) {
        throw new PickLockedError(
          `Race ${validated.raceId} is locked — picks can no longer be submitted`,
        )
      }

      try {
        const created = await tx.pickSet.create({
          data: { userId, raceId: validated.raceId, ...data },
        })
        return mapPickSetToData(created)
      } catch (err) {
        // [userId, raceId] unique constraint catches concurrent double-create.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new Error('A pick set already exists for this race — please refresh')
        }
        throw err
      }
    }

    const pickSet = await tx.pickSet.findUnique({
      where: { userId_raceId: { userId, raceId: validated.raceId } },
    })
    if (!pickSet) {
      throw new Error('Pick set vanished after update — this should never happen')
    }
    return mapPickSetToData(pickSet)
  })
}

/**
 * Get a user's pick set for a specific race, including the score breakdown
 * if one has been computed.
 *
 * Returns null if the user has not submitted picks for this race.
 */
export async function getPickForRace(
  userId: string,
  raceId: string,
): Promise<PickSetWithScore | null> {
  const pickSet = await db.pickSet.findUnique({
    where: { userId_raceId: { userId, raceId } },
    include: {
      scoreBreakdown: true,
      race: true,
      tenthPlaceDriver: {
        include: {
          constructor: true,
        },
      },
      winnerDriver: {
        include: {
          constructor: true,
        },
      },
      dnfDriver: {
        include: {
          constructor: true,
        },
      },
    },
  })

  if (!pickSet) return null

  return {
    ...mapPickSetToData({
      ...pickSet,
      tenthPlaceSeatKey: resolveStoredSeatKey(
        pickSet.tenthPlaceSeatKey,
        pickSet.tenthPlaceDriver,
      ),
      winnerSeatKey: resolveStoredSeatKey(
        pickSet.winnerSeatKey,
        pickSet.winnerDriver,
      ),
      dnfSeatKey: resolveStoredSeatKey(
        pickSet.dnfSeatKey,
        pickSet.dnfDriver,
      ),
    }),
    race: mapRaceToSummary(pickSet.race),
    scoreBreakdown: pickSet.scoreBreakdown
      ? {
          tenthPlaceScore: pickSet.scoreBreakdown.tenthPlaceScore,
          winnerBonus: pickSet.scoreBreakdown.winnerBonus,
          dnfBonus: pickSet.scoreBreakdown.dnfBonus,
          totalScore: pickSet.scoreBreakdown.totalScore,
          computedAt: pickSet.scoreBreakdown.computedAt,
        }
      : null,
  }
}

/**
 * Get all of a user's pick sets for a season, ordered by race round.
 * Includes score breakdowns where computed.
 */
export async function getPicksForSeason(
  userId: string,
  seasonId: string,
): Promise<PickSetWithScore[]> {
  const pickSets = await db.pickSet.findMany({
    where: {
      userId,
      race: { seasonId },
    },
    include: {
      scoreBreakdown: true,
      race: true,
      tenthPlaceDriver: {
        include: {
          constructor: true,
        },
      },
      winnerDriver: {
        include: {
          constructor: true,
        },
      },
      dnfDriver: {
        include: {
          constructor: true,
        },
      },
    },
    orderBy: {
      race: { round: 'asc' },
    },
  })

  return pickSets.map((ps) => ({
    ...mapPickSetToData({
      ...ps,
      tenthPlaceSeatKey: resolveStoredSeatKey(
        ps.tenthPlaceSeatKey,
        ps.tenthPlaceDriver,
      ),
      winnerSeatKey: resolveStoredSeatKey(ps.winnerSeatKey, ps.winnerDriver),
      dnfSeatKey: resolveStoredSeatKey(ps.dnfSeatKey, ps.dnfDriver),
    }),
    race: mapRaceToSummary(ps.race),
    scoreBreakdown: ps.scoreBreakdown
      ? {
          tenthPlaceScore: ps.scoreBreakdown.tenthPlaceScore,
          winnerBonus: ps.scoreBreakdown.winnerBonus,
          dnfBonus: ps.scoreBreakdown.dnfBonus,
          totalScore: ps.scoreBreakdown.totalScore,
          computedAt: ps.scoreBreakdown.computedAt,
        }
      : null,
  }))
}

/**
 * Return the set of raceIds for which a user has submitted picks in a season.
 * Used to render pick-status badges on the race list.
 */
export async function getPickedRaceIds(
  userId: string,
  seasonId: string,
): Promise<Set<string>> {
  const picks = await db.pickSet.findMany({
    where: {
      userId,
      race: { seasonId },
    },
    select: { raceId: true },
  })
  return new Set(picks.map((p) => p.raceId))
}
