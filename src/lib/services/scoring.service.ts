/**
 * Score computation orchestration service.
 *
 * This layer bridges the domain scoring formula (pure functions) with the
 * database. It loads race results, builds the driver number mapping, runs
 * the formula, and persists the output via upsert so repeated calls are safe.
 */

import { db } from '@/lib/db/client'
import {
  computeRaceScore,
  type DriverIdToNumber,
} from '@/lib/scoring/formula'
import type { ScoreBreakdownData } from '@/types/domain'
import type { NormalizedFinalResult } from '@/lib/f1/types'

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Compute and persist scores for every pick set belonging to a race.
 *
 * Idempotent — safe to call multiple times. Each ScoreBreakdown row is
 * upserted so recomputing after a result correction produces correct values.
 *
 * @returns The number of pick sets whose scores were computed/updated.
 * @throws  If the race is not found or has no results stored.
 */
export async function computeAndStoreScoresForRace(
  raceId: string,
): Promise<number> {
  // 1. Load the race with its type (MAIN | SPRINT) and stored results
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: {
      id: true,
      type: true,
      results: {
        select: {
          driverId: true,
          position: true,
          status: true,
        },
      },
    },
  })

  if (!race) {
    throw new Error(`Race not found: ${raceId}`)
  }

  if (race.results.length === 0) {
    throw new Error(
      `Race ${raceId} has no stored results — run result ingestion first`,
    )
  }

  // 2. Load all pick sets for the race
  const pickSets = await db.pickSet.findMany({
    where: { raceId },
    select: {
      id: true,
      tenthPlaceDriverId: true,
      winnerDriverId: true,
      dnfDriverId: true,
    },
  })

  if (pickSets.length === 0) return 0

  // 3. Build a Map<driverDbId, openf1DriverNumber> for formula lookup.
  //    We need the OpenF1 driver number because NormalizedFinalResult uses it.
  const driverIds = Array.from(
    new Set([
      ...pickSets.map((ps) => ps.tenthPlaceDriverId),
      ...pickSets.map((ps) => ps.winnerDriverId),
      ...pickSets.map((ps) => ps.dnfDriverId),
    ]),
  )

  // Query driver numbers via the results table to avoid Prisma's Driver select
  // type conflict caused by the `constructor` relation key shadowing Object.constructor
  const driverNumbers = await db.$queryRaw<
    Array<{ id: string; openf1DriverNumber: number | null }>
  >`SELECT id, "openf1DriverNumber" FROM "Driver" WHERE id = ANY(${driverIds}::text[])`

  const driverMap: DriverIdToNumber = new Map(
    driverNumbers
      .filter(
        (d): d is { id: string; openf1DriverNumber: number } =>
          d.openf1DriverNumber !== null,
      )
      .map((d) => [d.id, d.openf1DriverNumber]),
  )

  // Helper to look up openf1DriverNumber for a DB driver id
  const getDriverNum = (driverId: string): number | undefined =>
    driverMap.get(driverId)

  // 4. Build NormalizedFinalResult array from DB results
  const normalizedResults: NormalizedFinalResult[] = race.results
    .map((r) => {
      const driverNum = getDriverNum(r.driverId)
      if (driverNum === undefined) return null

      return {
        driverNumber: driverNum,
        position: r.position,
        // Prisma ResultStatus strings match NormalizedFinalResult status union
        status: r.status as NormalizedFinalResult['status'],
      } satisfies NormalizedFinalResult
    })
    .filter((r): r is NormalizedFinalResult => r !== null)

  const scoringCtx = {
    raceType: race.type as 'MAIN' | 'SPRINT',
    results: normalizedResults,
  }

  // 5. Compute and upsert each score breakdown
  const now = new Date()
  let count = 0

  for (const ps of pickSets) {
    const score = computeRaceScore(
      {
        tenthPlaceDriverId: ps.tenthPlaceDriverId,
        winnerDriverId: ps.winnerDriverId,
        dnfDriverId: ps.dnfDriverId,
      },
      driverMap,
      scoringCtx,
    )

    await db.scoreBreakdown.upsert({
      where: { pickSetId: ps.id },
      create: {
        pickSetId: ps.id,
        tenthPlaceScore: score.tenthPlaceScore,
        winnerBonus: score.winnerBonus,
        dnfBonus: score.dnfBonus,
        totalScore: score.totalScore,
        computedAt: now,
      },
      update: {
        tenthPlaceScore: score.tenthPlaceScore,
        winnerBonus: score.winnerBonus,
        dnfBonus: score.dnfBonus,
        totalScore: score.totalScore,
        computedAt: now,
      },
    })

    count++
  }

  return count
}

/**
 * Recompute the score for a single pick set and upsert the result.
 *
 * Useful for on-demand recomputation (e.g. after a result correction).
 *
 * @throws If the pick set, its race, or the race results are not found.
 */
export async function recomputeScoreForPickSet(
  pickSetId: string,
): Promise<ScoreBreakdownData> {
  const ps = await db.pickSet.findUnique({
    where: { id: pickSetId },
    select: {
      id: true,
      tenthPlaceDriverId: true,
      winnerDriverId: true,
      dnfDriverId: true,
      race: {
        select: {
          id: true,
          type: true,
          results: {
            select: {
              driverId: true,
              position: true,
              status: true,
            },
          },
        },
      },
    },
  })

  if (!ps) throw new Error(`PickSet not found: ${pickSetId}`)
  if (ps.race.results.length === 0) {
    throw new Error(
      `Race ${ps.race.id} has no results — cannot compute score for pick set ${pickSetId}`,
    )
  }

  // Resolve driver numbers for the three picks
  const driverIds = [
    ps.tenthPlaceDriverId,
    ps.winnerDriverId,
    ps.dnfDriverId,
  ]

  // Use raw query to avoid Prisma's Driver select type conflict with `constructor` relation
  const driverNumbers = await db.$queryRaw<
    Array<{ id: string; openf1DriverNumber: number | null }>
  >`SELECT id, "openf1DriverNumber" FROM "Driver" WHERE id = ANY(${driverIds}::text[])`

  const driverMap: DriverIdToNumber = new Map(
    driverNumbers
      .filter(
        (d): d is { id: string; openf1DriverNumber: number } =>
          d.openf1DriverNumber !== null,
      )
      .map((d) => [d.id, d.openf1DriverNumber]),
  )

  const normalizedResults: NormalizedFinalResult[] = ps.race.results
    .map((r) => {
      const driverNum = driverMap.get(r.driverId)
      if (driverNum === undefined) return null

      return {
        driverNumber: driverNum,
        position: r.position,
        status: r.status as NormalizedFinalResult['status'],
      } satisfies NormalizedFinalResult
    })
    .filter((r): r is NormalizedFinalResult => r !== null)

  const score = computeRaceScore(
    {
      tenthPlaceDriverId: ps.tenthPlaceDriverId,
      winnerDriverId: ps.winnerDriverId,
      dnfDriverId: ps.dnfDriverId,
    },
    driverMap,
    {
      raceType: ps.race.type as 'MAIN' | 'SPRINT',
      results: normalizedResults,
    },
  )

  const now = new Date()

  await db.scoreBreakdown.upsert({
    where: { pickSetId: ps.id },
    create: {
      pickSetId: ps.id,
      tenthPlaceScore: score.tenthPlaceScore,
      winnerBonus: score.winnerBonus,
      dnfBonus: score.dnfBonus,
      totalScore: score.totalScore,
      computedAt: now,
    },
    update: {
      tenthPlaceScore: score.tenthPlaceScore,
      winnerBonus: score.winnerBonus,
      dnfBonus: score.dnfBonus,
      totalScore: score.totalScore,
      computedAt: now,
    },
  })

  return {
    tenthPlaceScore: score.tenthPlaceScore,
    winnerBonus: score.winnerBonus,
    dnfBonus: score.dnfBonus,
    totalScore: score.totalScore,
    computedAt: now,
  }
}
